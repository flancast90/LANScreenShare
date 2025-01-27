const socket = io({
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ["websocket", "polling"],
  agent: false,
  rejectUnauthorized: false,
  withCredentials: true,
});

// DOM Elements
const elements = {
  screen: document.getElementById("screen"),
  modal: document.getElementById("modal"),
  codeInputs: document.querySelectorAll(".code-input"),
  joinBtn: document.getElementById("join-btn"),
  codeError: document.getElementById("code-error"),
  mainContent: document.getElementById("main-content"),
  connectionStatus: document.getElementById("connection-status"),
  peerStatus: document.getElementById("peer-status"),
  groupDisplay: document.getElementById("group-display"),
  timerBanner: document.getElementById("timer-banner"),
  timer: document.getElementById("timer"),
  premiumControls: document.getElementById("premium-controls"),
  robotToggle: document.getElementById("robot-toggle"),
  robotToggleContainer: document.getElementById("robot-toggle-container"),
  fullscreenBtn: document.getElementById("fullscreen-btn"),
  changeGroup: document.getElementById("change-group"),
  upgradeBtn: document.getElementById("upgrade-btn"),
  upgradeModal: document.getElementById("upgrade-modal"),
  submitPayment: document.getElementById("submit-payment"),
  cardElement: document.getElementById("card-element"),
  cardErrors: document.getElementById("card-errors"),
  premiumRobotToggle: document.getElementById("premium-robot-toggle"),
  lastConnection: document.getElementById("last-connection"),
  rejoinLastBtn: document.getElementById("rejoin-last-btn"),
  lastGroupCode: document.getElementById("last-group-code"),
};

// State management
const state = {
  group: null,
  isPremium: false,
  timerInterval: null,
  remainingTime: 30 * 60,
};

// Debug utilities
const debug = {
  log: (...args) => console.log("[Debug]", ...args),
  error: (...args) => console.error("[Error]", ...args),
  warn: (...args) => console.warn("[Warning]", ...args),
};

// Initialize Stripe
let stripe;
let card;
try {
  stripe = Stripe(
    "pk_test_51Q06EeEybXCPFMn8pCGhPVEaygOV5sj2hAb2tLBSk5kKUmm6cEY9zfADbuNJ8WafGteAyZyM0eZMXA55YAwYklqj00Yz8K2uB8"
  );
  const elements = stripe.elements();
  card = elements.create("card", {
    style: {
      base: {
        color: "#ffffff",
        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
        fontSmoothing: "antialiased",
        fontSize: "16px",
        "::placeholder": {
          color: "#aab7c4",
        },
      },
      invalid: {
        color: "#fa755a",
        iconColor: "#fa755a",
      },
    },
  });
  card.mount("#card-element");
} catch (error) {
  debug.error("Error initializing Stripe:", error);
}

// Initialize UI
function initializeUI() {
  // Show modal, hide main content initially
  elements.modal.classList.remove("hidden");
  elements.mainContent.classList.add("hidden");

  // Auto-focus first code input
  elements.codeInputs[0].focus();

  // Auto-focus for code inputs
  elements.codeInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      if (input.value && index < elements.codeInputs.length - 1) {
        elements.codeInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        elements.codeInputs[index - 1].focus();
      }
    });
  });

  // Change group button
  elements.changeGroup?.addEventListener("click", () => {
    state.group = null;
    elements.mainContent.classList.add("hidden");
    elements.modal.classList.remove("hidden");
    elements.codeInputs[0].focus();
  });

  // Fullscreen button
  elements.fullscreenBtn?.addEventListener("click", toggleFullscreen);

  // Add upgrade button handler
  elements.upgradeBtn?.addEventListener("click", () => {
    elements.upgradeModal.classList.remove("hidden");
  });

  // Initialize peer status
  elements.peerStatus.textContent = "Waiting for host...";
  elements.peerStatus.classList.add("bg-gray-700");

  // Initialize robot toggle for non-premium users
  if (elements.robotToggleContainer && !state.isPremium) {
    elements.robotToggleContainer.classList.remove("hidden");
    elements.robotToggle.disabled = true;
    elements.robotToggle.parentElement.classList.add(
      "opacity-50",
      "cursor-not-allowed"
    );
  }

  // Check for last group and show rejoin option
  const lastGroup = getLastGroup();
  if (lastGroup) {
    elements.lastConnection.classList.remove("hidden");
    elements.lastGroupCode.textContent = lastGroup;
  }

  // Add rejoin button handler
  elements.rejoinLastBtn?.addEventListener("click", () => {
    const lastGroup = getLastGroup();
    if (!lastGroup) return;

    state.group = lastGroup;
    socket.emit("subscribe", lastGroup, (error) => {
      if (error) {
        debug.error("Subscribe error:", error);
        elements.codeError.textContent = "Failed to join group: " + error;
        elements.codeError.classList.remove("hidden");
        return;
      }

      handleSuccessfulJoin(lastGroup);
    });
  });
}

// Join group handling
elements.joinBtn.addEventListener("click", () => {
  debug.log("Join button clicked");

  const code = Array.from(elements.codeInputs)
    .map((input) => input.value)
    .join("");

  debug.log("Attempting to join with code:", code);

  if (code.length !== 6 || !/^\d+$/.test(code)) {
    elements.codeError.textContent = "Please enter a valid 6-digit code";
    elements.codeError.classList.remove("hidden");
    return;
  }

  state.group = code;
  socket.emit("subscribe", code, (error) => {
    if (error) {
      debug.error("Subscribe error:", error);
      elements.codeError.textContent = "Failed to join group: " + error;
      elements.codeError.classList.remove("hidden");
      return;
    }

    handleSuccessfulJoin(code);
  });
});

// Timer functions
function startTimer() {
  elements.timerBanner.classList.remove("hidden");
  updateTimer();
  state.timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (state.remainingTime <= 0) {
    clearInterval(state.timerInterval);
    socket.disconnect();
    showDisconnectedModal("Free trial expired");
    return;
  }

  const minutes = Math.floor(state.remainingTime / 60);
  const seconds = state.remainingTime % 60;
  elements.timer.textContent = `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
  state.remainingTime--;
}

// UI functions
function showDisconnectedModal(reason) {
  elements.modal.classList.remove("hidden");
  elements.mainContent.classList.add("hidden");
  elements.codeError.textContent = `Disconnected: ${reason}`;
  elements.codeError.classList.remove("hidden");
  state.group = null;
  clearInterval(state.timerInterval);
}

// Socket event handlers
socket.on("connect", () => {
  debug.log("Connected to server, ID:", socket.id);
  elements.connectionStatus.textContent = "Connection Status: Connected";
  elements.connectionStatus.classList.remove("text-red-500");
  elements.connectionStatus.classList.add("text-green-500");

  // Check premium status on connection
  socket.emit("check_premium_status");
});

socket.on("share", (data) => {
  if (!data?.image || data.group !== state.group) return;
  elements.screen.src = "data:image/jpeg;base64," + data.image;
});

socket.on("host_connected", (hostGroup) => {
  if (hostGroup === state.group) {
    elements.peerStatus.textContent = "Host Connected";
    elements.peerStatus.classList.remove("bg-gray-700", "bg-red-900");
    elements.peerStatus.classList.add("bg-green-900");
  }
});

socket.on("host_disconnected", (hostGroup) => {
  if (hostGroup === state.group) {
    elements.peerStatus.textContent = "Host Disconnected";
    elements.peerStatus.classList.remove("bg-gray-700", "bg-green-900");
    elements.peerStatus.classList.add("bg-red-900");
  }
});

socket.on("premium_status", (status) => {
  state.isPremium = status;
  updatePremiumUI();
});

socket.on("disconnect", (reason) => {
  debug.warn("Disconnected:", reason);
  elements.connectionStatus.textContent = "Connection Status: Disconnected";
  elements.connectionStatus.classList.remove("text-green-500");
  elements.connectionStatus.classList.add("text-red-500");
  showDisconnectedModal(reason);
});

// Mouse control
elements.screen.addEventListener("mousemove", (e) => {
  if (!socket.connected || !state.group) return;
  const rect = elements.screen.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  // Only send mouse events if robot control is enabled
  if (elements.robotToggle?.checked || elements.premiumRobotToggle?.checked) {
    socket.emit("mouse_move", { group: state.group, x, y });
  }
});

elements.screen.addEventListener("click", (e) => {
  if (!socket.connected || !state.group) return;
  const rect = elements.screen.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  // Only send click events if robot control is enabled
  if (elements.robotToggle?.checked || elements.premiumRobotToggle?.checked) {
    socket.emit("mouse_click", { group: state.group, x, y, button: "left" });
  }
});

// Add these mouse event listeners after the existing ones
elements.screen.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Prevent the default context menu
  if (!socket.connected || !state.group) return;

  const rect = elements.screen.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  // Only send right click events if robot control is enabled
  if (elements.robotToggle?.checked || elements.premiumRobotToggle?.checked) {
    socket.emit("mouse_click", { group: state.group, x, y, button: "right" });
  }
});

// Add keyboard event listener to the screen
elements.screen.addEventListener("keydown", (e) => {
  if (!socket.connected || !state.group) return;

  // Only send keyboard events if robot control is enabled
  if (elements.robotToggle?.checked || elements.premiumRobotToggle?.checked) {
    socket.emit("key_press", {
      group: state.group,
      key: e.key,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    });
  }
});

// Fullscreen handling
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    elements.screen.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// New function to update UI based on premium status
function updatePremiumUI() {
  if (state.isPremium) {
    // Premium user UI updates
    elements.timerBanner.classList.add("hidden");
    elements.premiumControls?.classList.remove("hidden");
    elements.robotToggleContainer?.classList.add("hidden");
    clearInterval(state.timerInterval);

    // Enable premium robot control
    if (elements.premiumRobotToggle) {
      elements.premiumRobotToggle.disabled = false;
      elements.premiumRobotToggle.parentElement.classList.remove(
        "opacity-50",
        "cursor-not-allowed"
      );
    }
  } else {
    // Non-premium user UI updates
    elements.premiumControls?.classList.add("hidden");
    elements.robotToggleContainer?.classList.remove("hidden");
    if (!elements.timerBanner.classList.contains("hidden")) {
      startTimer();
    }

    // Disable regular robot control
    if (elements.robotToggle) {
      elements.robotToggle.disabled = true;
      elements.robotToggle.checked = false;
      elements.robotToggle.parentElement.classList.add(
        "opacity-50",
        "cursor-not-allowed"
      );
    }
  }
}

// Check premium status periodically
setInterval(() => {
  if (socket.connected) {
    socket.emit("check_premium_status");
  }
}, 60000); // Check every minute

// Update payment submission handler
elements.submitPayment?.addEventListener("click", async (e) => {
  e.preventDefault();
  elements.submitPayment.disabled = true;
  elements.submitPayment.textContent = "Processing...";

  try {
    const { paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: card,
    });

    const response = await fetch("/create-subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentMethodId: paymentMethod.id,
      }),
    });

    const data = await response.json();

    if (data.error) {
      elements.cardErrors.textContent = data.error;
      elements.submitPayment.disabled = false;
      elements.submitPayment.textContent = "Subscribe Now";
      return;
    }

    const { clientSecret } = data;
    const { error } = await stripe.confirmCardPayment(clientSecret);

    if (error) {
      elements.cardErrors.textContent = error.message;
      elements.submitPayment.disabled = false;
      elements.submitPayment.textContent = "Subscribe Now";
      return;
    }

    // Handle successful payment
    await handlePaymentSuccess(data);
  } catch (error) {
    debug.error("Payment error:", error);
    elements.cardErrors.textContent =
      "An unexpected error occurred. Please try again.";
    elements.submitPayment.disabled = false;
    elements.submitPayment.textContent = "Subscribe Now";
  }
});

// Update payment success handling
async function handlePaymentSuccess(subscription) {
  elements.upgradeModal.classList.add("hidden");
  state.isPremium = true;
  updatePremiumUI();

  // Refresh premium status from server
  socket.emit("check_premium_status");
}

// Add error handling for card element
card?.addEventListener("change", ({ error }) => {
  if (error) {
    elements.cardErrors.textContent = error.message;
  } else {
    elements.cardErrors.textContent = "";
  }
});

// Add robot toggle event handlers
elements.robotToggle?.addEventListener("change", (e) => {
  if (!state.isPremium) return;

  socket.emit("robot_control", {
    group: state.group,
    enabled: e.target.checked,
  });
});

elements.premiumRobotToggle?.addEventListener("change", (e) => {
  if (!state.isPremium) return;

  socket.emit("robot_control", {
    group: state.group,
    enabled: e.target.checked,
  });
});

// Add CSS styles for the toggle dot movement
const style = document.createElement("style");
style.textContent = `
  input:checked ~ .dot {
    transform: translateX(100%);
  }
  input:checked + div {
    background-color: #4F46E5;
  }
`;
document.head.appendChild(style);

// Add these functions after the state management section
function saveLastGroup(groupCode) {
  localStorage.setItem("lastGroup", groupCode);
}

function getLastGroup() {
  return localStorage.getItem("lastGroup");
}

// Create a new function to handle successful joins
function handleSuccessfulJoin(groupCode) {
  debug.log("Successfully joined group:", groupCode);

  // Save the group code
  saveLastGroup(groupCode);

  elements.modal.classList.add("hidden");
  elements.mainContent.classList.remove("hidden");
  elements.codeError.classList.add("hidden");

  elements.groupDisplay.innerHTML = `<i class="fas fa-layer-group mr-2"></i>Group: ${groupCode}`;

  elements.connectionStatus.textContent = "Connection Status: Connected";
  elements.connectionStatus.classList.remove("text-red-500");
  elements.connectionStatus.classList.add("text-green-500");

  if (!state.isPremium) {
    startTimer();
  }
}

// Make the screen focusable
elements.screen.tabIndex = 0;

// Initialize the UI
initializeUI();
