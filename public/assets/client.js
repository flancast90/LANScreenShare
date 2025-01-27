let group = prompt("Enter group join code: ");
const socket = io({
  reconnectionAttempts: 5,
  query: { previousId: localStorage.getItem("socketId") },
});

const statusBar = document.getElementById("status-bar");
const peerStatus = document.getElementById("peer-status");
const screenImg = document.getElementById("screen");
const fullscreenBtn = document.getElementById("fullscreen-btn");

function updateStatusBar(message, type) {
  statusBar.textContent = message;
  statusBar.className = `fixed top-0 left-0 right-0 p-3 text-white text-center transform translate-y-0 transition-transform duration-300 ${
    type === "connected"
      ? "bg-green-700"
      : type === "disconnected"
      ? "bg-red-700"
      : "bg-yellow-600"
  }`;

  setTimeout(() => {
    statusBar.classList.replace("translate-y-0", "-translate-y-full");
  }, 3000);
}

// Fullscreen handling
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    screenImg.requestFullscreen();
    fullscreenBtn.innerHTML =
      '<i class="fas fa-compress mr-2"></i>Exit Fullscreen';
  } else {
    document.exitFullscreen();
    fullscreenBtn.innerHTML = '<i class="fas fa-expand mr-2"></i>Fullscreen';
  }
});

// Connection handling
socket.on("connect", () => {
  updateStatusBar("Connected to server", "connected");
  localStorage.setItem("socketId", socket.id);
  socket.emit("subscribe", group);
  document.getElementById(
    "group"
  ).innerHTML = `<i class="fas fa-layer-group mr-2"></i>Group: ${group}`;
});

socket.on("disconnect", (reason) => {
  updateStatusBar("Disconnected from server: " + reason, "disconnected");
});

socket.on("reconnect_attempt", (attemptNumber) => {
  updateStatusBar(
    "Attempting to reconnect... (Attempt " + attemptNumber + ")",
    "reconnecting"
  );
});

socket.on("reconnect", (attemptNumber) => {
  updateStatusBar(
    "Reconnected after " + attemptNumber + " attempts",
    "connected"
  );
  socket.emit("subscribe", group);
});

socket.on("reconnect_error", (error) => {
  updateStatusBar("Reconnection error: " + error, "disconnected");
});

socket.on("reconnect_failed", () => {
  updateStatusBar("Failed to reconnect after maximum attempts", "disconnected");
});

socket.on("server_shutdown", () => {
  updateStatusBar("Server is shutting down", "disconnected");
});

// Peer status handling
socket.on("peer_status", (data) => {
  const statusMessage = `<i class="fas fa-user mr-2"></i>Peer ${data.id} ${data.status}`;
  peerStatus.innerHTML = statusMessage;
  peerStatus.className = `mt-4 p-3 rounded-lg transition-colors duration-300 ${
    data.status === "connected"
      ? "bg-green-900 text-green-100"
      : "bg-red-900 text-red-100"
  }`;
  setTimeout(() => {
    peerStatus.className =
      "mt-4 p-3 rounded-lg bg-gray-700 text-gray-300 transition-colors duration-300";
  }, 3000);
});

// Screen sharing
socket.on("share", function (data) {
  screenImg.src = "data:image/jpg;base64," + data;
});

// Group handling
document.getElementById("change_group").addEventListener("click", function () {
  group = prompt("Enter group join code: ");
  document.getElementById(
    "group"
  ).innerHTML = `<i class="fas fa-layer-group mr-2"></i>Group: ${group}`;
  socket.emit("subscribe", group);
});

// Mouse control
screenImg.addEventListener("mousemove", function (e) {
  if (socket.connected) {
    const rect = screenImg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    socket.emit("mouse_move", { group, x, y });
  }
});

screenImg.addEventListener("click", function (e) {
  if (socket.connected) {
    const rect = screenImg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    socket.emit("mouse_click", { group, x, y });
  }
});

// Reconnection handling
socket.on("reconnected", (existingGroup) => {
  group = existingGroup;
  document.getElementById(
    "group"
  ).innerHTML = `<i class="fas fa-layer-group mr-2"></i>Group: ${group}`;
  updateStatusBar("Reconnected to previous session", "connected");
});
