const express = require("express");
const port = 8000;
const app = express();

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  // Add reconnection configuration
  pingTimeout: 60000,
  pingInterval: 25000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// Keep track of client groups
const clientGroups = new Map();

app.use(express.json({ limit: "50mb" }));
app.use(
  express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 })
);

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

    // Notify other group members about new connection
    socket.to(group).emit("peer_status", {
      id: socket.id,
      status: "connected",
    });
  });

  socket.on("screenshot", (data) => {
    // Only relay if client is still in group
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
      // Notify other group members about disconnection
      socket.to(group).emit("peer_status", {
        id: socket.id,
        status: "disconnected",
        reason: reason,
      });

      // Keep the group association for a while in case of reconnection
      setTimeout(() => {
        if (!socket.connected) {
          clientGroups.delete(socket.id);
        }
      }, 60000); // Keep for 1 minute
    }
  });

  // Handle explicit reconnection attempts
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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/client_view.html");
});

server.listen(port, () => {
  console.log(`🚀 Server Running on: http://localhost:${port}`);
});

// Handle server shutdown gracefully
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("Gracefully shutting down...");

  // Notify all clients
  io.emit("server_shutdown");

  // Close all connections
  io.close(() => {
    console.log("All connections closed");
    server.close(() => {
      console.log("Server shut down");
      process.exit(0);
    });
  });
}
