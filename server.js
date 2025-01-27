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

app.use(express.static("public"));

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

app.use(express.json({ limit: "50mb" }));
app.use(
  express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

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
        source: req.body.paymentMethodId,
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

    if (event.type === "invoice.payment_succeeded") {
      const subscription = event.data.object;
      const user = await User.findOne({
        stripeCustomerId: subscription.customer,
      });
      if (user) {
        user.isPremium = true;
        user.premiumUntil = new Date(subscription.period_end * 1000);
        await user.save();
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const user = await User.findOne({
        stripeCustomerId: subscription.customer,
      });
      if (user) {
        user.isPremium = false;
        user.subscriptionId = null;
        user.subscriptionStatus = "canceled";
        await user.save();
      }
    }

    res.json({ received: true });
  }
);

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

  // Handle reconnection
  const existingGroup = clientGroups.get(socket.handshake.query.previousId);
  if (existingGroup) {
    console.log(`Client ${socket.id} reconnected to group ${existingGroup}`);
    socket.join(existingGroup);
    socket.emit("reconnected", existingGroup);
  }

  socket.on("subscribe", (group) => {
    console.log(`Client: ${socket.id} joined group ${group}`);
    socket.join(group);
    clientGroups.set(socket.id, group);

    socket.to(group).emit("peer_status", {
      id: socket.id,
      status: "connected",
    });
  });

  socket.on("screenshot", (data) => {
    if (clientGroups.get(socket.id) === data.group) {
      socket.to(data.group).emit("share", data.image);
      console.log(`Screenshot relayed to group: ${data.group}`);
    }
  });

  socket.on("mouse_move", (data) => {
    if (clientGroups.get(socket.id) === data.group) {
      socket.to(data.group).emit("mouse_move", { x: data.x, y: data.y });
    }
  });

  socket.on("mouse_click", (data) => {
    if (clientGroups.get(socket.id) === data.group) {
      socket.to(data.group).emit("mouse_click", { x: data.x, y: data.y });
    }
  });

  socket.on("disconnect", (reason) => {
    const group = clientGroups.get(socket.id);
    console.log(`Client: ${socket.id} disconnected! Reason: ${reason}`);

    if (group) {
      socket.to(group).emit("peer_status", {
        id: socket.id,
        status: "disconnected",
        reason: reason,
      });

      setTimeout(() => {
        if (!socket.connected) {
          clientGroups.delete(socket.id);
        }
      }, 60000);
    }
  });

  socket.on("reconnect_attempt", () => {
    console.log(`Client ${socket.id} attempting to reconnect...`);
  });

  socket.on("error", (error) => {
    console.error(`Socket error for client ${socket.id}:`, error);
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
