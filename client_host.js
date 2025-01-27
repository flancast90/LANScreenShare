const screenshot = require("screenshot-desktop");
const robot = require("robotjs");
const io = require("socket.io-client");

const dev = false;
const endpoint = dev
  ? "http://localhost:8000"
  : "https://lan-screen-share-flancast90.replit.app/";
const socket = io(endpoint, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ["websocket", "polling"],
  agent: false,
  rejectUnauthorized: false,
  withCredentials: true,
});

const screenSize = robot.getScreenSize();
const config = {
  refreshRate: 600, // Increased refresh rate (60fps)
};

const group = Math.floor(100000 + Math.random() * 900000).toString();
let screenshotInterval = null;

let isPremium = false;
let robotEnabled = false;

// Terminal colors for pretty output
const Reset = "\x1b[0m";
const FgRed = "\x1b[31m";
const FgGreen = "\x1b[32m";
const FgYellow = "\x1b[33m";
const FgMagenta = "\x1b[35m";

// Display header
console.log(`
==============================
_       ___   _   _         
| |     / _ \\ | \\ | |        
| |    / /_\\ \\|  \\| |___ ___ 
| |    |  _  || . \` / __/ __|
| |____| | | || |\\  \\__ \\__ \\
\\_____/\\_| |_/\\_| \\_/___/___/
==============================

> Local Area Network Screen Sharing
> Version 1.0.0

Your group ID is: ${FgMagenta}${group}${Reset}
By: @flancast90
`);

// Socket connection handling
socket.on("connect", () => {
  console.log(`${FgGreen}Connected to remote control server${Reset}`);
  console.log(`${FgGreen}Socket ID: ${socket.id}${Reset}`);
  console.log(
    `${FgGreen}Transport: ${socket.io.engine.transport.name}${Reset}`
  );

  socket.emit("subscribe", group, (error) => {
    if (error) {
      console.log(`${FgRed}Error subscribing to group: ${error}${Reset}`);
    } else {
      console.log(
        `${FgGreen}Successfully subscribed to group: ${group}${Reset}`
      );
      startScreensharing();
    }
  });

  // Notify clients when host connects
  socket.emit("host_connected", group);
});

socket.on("disconnect", (reason) => {
  console.log(
    `${FgRed}Disconnected from remote control server: ${reason}${Reset}`
  );
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
    console.log(`${FgYellow}Screenshot sharing stopped${Reset}`);
  }

  // Add disconnect handler to notify clients
  socket.emit("host_disconnected", group);
});

socket.on("connect_error", (error) => {
  console.log(`${FgRed}Connection error: ${error.message}${Reset}`);
  console.log(`${FgRed}Stack trace: ${error.stack}${Reset}`);
});

socket.on("error", (error) => {
  console.log(`${FgRed}Socket error: ${error.message}${Reset}`);
  console.log(`${FgRed}Stack trace: ${error.stack}${Reset}`);
});

// Add premium status handler
socket.on("premium_status", (status) => {
  isPremium = status;
  if (!isPremium) {
    console.log(
      `${FgYellow}Running in free mode - limited to 30 minutes${Reset}`
    );
    setTimeout(() => {
      console.log(`${FgRed}Free trial expired${Reset}`);
      process.exit();
    }, 30 * 60 * 1000);
  }
});

// Update mouse control handlers
socket.on("robot_status", (data) => {
  robotEnabled = data.enabled;
  console.log(
    `${FgGreen}Robot mode ${robotEnabled ? "enabled" : "disabled"}${Reset}`
  );
});

// Modify existing mouse handlers to check robotEnabled
socket.on("mouse_move", (data) => {
  if (!robotEnabled) return;
  try {
    const x = Math.floor(data.x * screenSize.width);
    const y = Math.floor(data.y * screenSize.height);
    robot.moveMouse(x, y);
  } catch (error) {
    console.log(`${FgRed}Error moving mouse: ${error}${Reset}`);
  }
});

socket.on("mouse_click", (data) => {
  if (!robotEnabled) return;
  try {
    const x = Math.floor(data.x * screenSize.width);
    const y = Math.floor(data.y * screenSize.height);
    robot.moveMouse(x, y);
    robot.mouseClick();
  } catch (error) {
    console.log(`${FgRed}Error clicking mouse: ${error}${Reset}`);
  }
});

// Screenshot sharing function
function startScreensharing() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }

  console.log(`${FgGreen}Starting screen sharing...${Reset}`);

  screenshotInterval = setInterval(async () => {
    if (!socket.connected) {
      console.log(
        `${FgYellow}Not sending screenshot - socket disconnected${Reset}`
      );
      return;
    }

    try {
      const img = await screenshot({ format: "jpeg", quality: 30 });
      const base64Image = img.toString("base64");

      // Add size logging
      const dataSizeKB = Math.round(base64Image.length / 1024);

      socket.emit(
        "share",
        {
          group: group,
          image: base64Image,
        },
        (error) => {
          if (error) {
            console.log(`${FgRed}Error sending screenshot: ${error}${Reset}`);
          } else {
            console.log(`${FgGreen}Screenshot acknowledged by server${Reset}`);
          }
        }
      );

      console.log(`${FgGreen}Screenshot sent to group: ${group}${Reset}`);
    } catch (err) {
      console.log(`${FgRed}Error capturing screenshot: ${err}${Reset}`);
    }
  }, config.refreshRate);
}

// Handle process termination
process.on("SIGINT", () => {
  console.log(`\n${FgYellow}Shutting down...${Reset}`);
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  socket.disconnect();
  process.exit();
});

process.on("uncaughtException", (error) => {
  console.log(`${FgRed}Uncaught Exception: ${error}${Reset}`);
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  socket.disconnect();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.log(
    `${FgRed}Unhandled Rejection at: ${promise}, reason: ${reason}${Reset}`
  );
});

// Update socket event handlers
socket.on("robot_control", (data) => {
  if (data.group === group) {
    robotEnabled = data.enabled;
    console.log(
      `${FgGreen}Robot control ${robotEnabled ? "enabled" : "disabled"}${Reset}`
    );
  }
});
