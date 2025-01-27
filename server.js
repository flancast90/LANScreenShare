const express = require("express");
require("dotenv").config();
const port = process.env.PORT || 8000;
const app = express();
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
const path = require("path");

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Define User Schema with premium features
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  isPremium: { type: Boolean, default: false },
  stripeCustomerId: String,
  subscriptionId: String,
  subscriptionStatus: String,
  premiumUntil: Date,
});

const User = mongoose.model("lan_users", userSchema);

// Keep track of client groups
const clientGroups = new Map();

// Passport configuration
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username: username });
      if (!user) {
        return done(null, false, { message: "Incorrect username." });
      }
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: "Incorrect password." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

app.use(express.json({ limit: "50mb" }));
app.use(
  express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 })
);

// Create the session middleware first so we can share it
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  },
});

// Use the session middleware in Express
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Wrap the session middleware for Socket.IO
const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);

// Use the wrapped session middleware in Socket.IO
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

// Serve static HTML pages
app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});

app.get("/signup", (req, res) => {
  res.sendFile(__dirname + "/public/signup.html");
});

// Premium subscription endpoints
app.post("/create-subscription", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Create or get Stripe customer
    let customer;
    if (!user.stripeCustomerId) {
      customer = await stripe.customers.create({
        email: user.username,
        payment_method: req.body.paymentMethodId,
        invoice_settings: {
          default_payment_method: req.body.paymentMethodId,
        },
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    } else {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      expand: ["latest_invoice.payment_intent"],
    });

    user.subscriptionId = subscription.id;
    user.subscriptionStatus = subscription.status;
    user.isPremium = true;
    user.premiumUntil = new Date(subscription.current_period_end * 1000);
    await user.save();

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle various subscription events
    switch (event.type) {
      case "invoice.payment_succeeded":
        const subscription = event.data.object;
        await handleSuccessfulPayment(subscription);
        break;

      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        const subUpdate = event.data.object;
        await handleSubscriptionUpdate(subUpdate);
        break;
    }

    res.json({ received: true });
  }
);

async function handleSuccessfulPayment(subscription) {
  try {
    const user = await User.findOne({
      stripeCustomerId: subscription.customer,
    });
    if (user) {
      user.isPremium = true;
      user.premiumUntil = new Date(subscription.current_period_end * 1000);
      user.subscriptionStatus = subscription.status;
      await user.save();

      // Emit premium status update to all user's connected sockets
      const userSockets = Array.from(io.sockets.sockets.values()).filter(
        (socket) =>
          socket.request.session?.passport?.user === user._id.toString()
      );

      userSockets.forEach((socket) => {
        socket.emit("premium_status", true);
      });
    }
  } catch (error) {
    console.error("Error handling successful payment:", error);
  }
}

async function handleSubscriptionUpdate(subscription) {
  const user = await User.findOne({ stripeCustomerId: subscription.customer });
  if (user) {
    user.isPremium = subscription.status === "active";
    user.subscriptionStatus = subscription.status;
    if (subscription.status === "active") {
      user.premiumUntil = new Date(subscription.current_period_end * 1000);
    }
    await user.save();
  }
}

// Auth routes
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: "User created successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error creating user", error: err.message });
  }
});

app.post("/login", passport.authenticate("local"), (req, res) => {
  res.json({ message: "Logged in successfully" });
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: "Error logging out" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

io.on("connection", (socket) => {
  console.log(`Client: ${socket.id} connected!`);
  let isHost = false;

  // Premium status check function
  const checkAndEmitPremiumStatus = async () => {
    try {
      const userId = socket.request.session?.passport?.user;
      console.log("Checking premium status for user:", userId);

      if (userId) {
        const user = await User.findById(userId);
        console.log(
          "Found user:",
          user
            ? {
                id: user._id,
                isPremium: user.isPremium,
                premiumUntil: user.premiumUntil,
              }
            : "No user found"
        );

        if (user) {
          // Check if premium is still valid
          if (user.isPremium && user.premiumUntil) {
            const now = new Date();
            if (now > user.premiumUntil) {
              user.isPremium = false;
              await user.save();
              console.log("Premium expired, updated user");
            }
          }

          console.log("Emitting premium status:", user.isPremium);
          socket.emit("premium_status", user.isPremium);
        }
      } else {
        console.log("No user session found");
      }
    } catch (error) {
      console.error("Error checking premium status:", error);
    }
  };

  // Check premium status on connection
  checkAndEmitPremiumStatus();

  socket.on("subscribe", (group, callback) => {
    try {
      console.log(`Client ${socket.id} subscribing to group ${group}`);
      socket.join(group);
      if (!clientGroups.has(group)) {
        clientGroups.set(group, new Set());
      }
      clientGroups.get(group).add(socket.id);

      // If there's already a host in this group, notify the new client
      const hostExists = Array.from(
        io.sockets.adapter.rooms.get(group) || []
      ).some((socketId) => io.sockets.sockets.get(socketId).isHost);
      if (hostExists) {
        socket.emit("host_connected", group);
      }

      callback();
    } catch (error) {
      callback(error.message);
    }
  });

  socket.on("share", (data) => {
    console.log(`Received share for group: ${data.group}`);
    socket.to(data.group).emit("share", data);
  });

  socket.on("host_connected", (group) => {
    console.log(`Host ${socket.id} connected to group: ${group}`);
    socket.join(group);
    socket.isHost = true; // Mark this socket as a host
    isHost = true;
    io.to(group).emit("host_connected", group); // Emit to all clients in group, including sender
  });

  socket.on("host_disconnected", (group) => {
    console.log(`Host ${socket.id} disconnected from group: ${group}`);
    socket.isHost = false;
    isHost = false;
    io.to(group).emit("host_disconnected", group);
  });

  // Handle mouse movement
  socket.on("mouse_move", (data) => {
    // Forward mouse movement to the host in the same group
    socket.to(data.group).emit("mouse_move", {
      x: data.x,
      y: data.y,
    });
  });

  // Handle mouse clicks
  socket.on("mouse_click", (data) => {
    // Forward mouse clicks to the host in the same group
    socket.to(data.group).emit("mouse_click", {
      x: data.x,
      y: data.y,
    });
  });

  socket.on("disconnect", () => {
    // If this was a host, notify all groups it was in
    if (isHost) {
      socket.rooms.forEach((group) => {
        if (group !== socket.id) {
          // Skip the default room
          io.to(group).emit("host_disconnected", group);
        }
      });
    }

    // Clean up clientGroups
    for (const [group, members] of clientGroups) {
      if (members.has(socket.id)) {
        members.delete(socket.id);
        if (members.size === 0) {
          clientGroups.delete(group);
        }
      }
    }
  });

  socket.on("reconnect_attempt", () => {
    console.log(`Client ${socket.id} attempting to reconnect...`);
  });

  socket.on("error", (error) => {
    console.error(`Socket error for client ${socket.id}:`, error);
  });

  // Handle robot control toggle
  socket.on("robot_control", async (data) => {
    try {
      const userId = socket.request.session?.passport?.user;
      console.log("Checking robot control for user:", userId);

      if (userId) {
        const user = await User.findById(userId);
        console.log(
          "Found user:",
          user
            ? {
                id: user._id,
                isPremium: user.isPremium,
              }
            : "No user found"
        );

        if (user?.isPremium) {
          // Forward robot control status to the host
          socket.to(data.group).emit("robot_control", {
            group: data.group,
            enabled: data.enabled,
          });
        }
      } else {
        console.log("No user session found");
      }
    } catch (error) {
      console.error("Error handling robot control:", error);
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    connections: io.engine.clientsCount,
    uptime: process.uptime(),
  });
});

// Protected route example
app.get("/view", ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + "/public/client_view.html");
});

// index page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

server.listen(port, () => {
  console.log(`🚀 Server Running on: http://localhost:${port}`);
});

// Handle server shutdown gracefully
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("Gracefully shutting down...");

  io.emit("server_shutdown");

  io.close(() => {
    console.log("All connections closed");
    server.close(() => {
      console.log("Server shut down");
      mongoose.connection.close();
      process.exit(0);
    });
  });
}
