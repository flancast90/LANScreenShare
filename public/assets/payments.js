const stripe = Stripe(
  "pk_test_51Q06EeEybXCPFMn8pCGhPVEaygOV5sj2hAb2tLBSk5kKUmm6cEY9zfADbuNJ8WafGteAyZyM0eZMXA55YAwYklqj00Yz8K2uB8"
);
console.log(stripe);
const elements = stripe.elements();

// Create card Element
const card = elements.create("card", {
  style: {
    base: {
      color: "#fff",
      fontFamily: "Arial, sans-serif",
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

// Mount card Element
card.mount("#card-element");

// Handle validation errors
card.addEventListener("change", ({ error }) => {
  const displayError = document.getElementById("card-errors");
  if (error) {
    displayError.textContent = error.message;
  } else {
    displayError.textContent = "";
  }
});

// Handle form submission
document
  .getElementById("submit-payment")
  .addEventListener("click", async (event) => {
    event.preventDefault();
    const submitButton = event.target;
    submitButton.disabled = true;
    submitButton.textContent = "Processing...";

    try {
      const { paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: card,
      });

      // Send payment method ID to server
      const response = await fetch("/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
        }),
      });

      const subscription = await response.json();

      if (subscription.error) {
        throw new Error(subscription.error);
      }

      // Handle subscription success
      const { clientSecret } = subscription;
      const { error } = await stripe.confirmCardPayment(clientSecret);

      if (error) {
        throw new Error(error.message);
      }

      // Success! Update UI
      document.getElementById("upgrade-modal").classList.add("hidden");
      document.getElementById("timer-banner").classList.add("hidden");
      document.getElementById("premium-controls").classList.remove("hidden");
      document.getElementById("robot-toggle-container").classList.add("hidden");

      // Notify socket about premium status
      window.socket.emit("premium_status_check");
    } catch (error) {
      const errorElement = document.getElementById("card-errors");
      errorElement.textContent = error.message;
    }

    submitButton.disabled = false;
    submitButton.textContent = "Subscribe Now";
  });

// Handle upgrade button click
document.getElementById("upgrade-btn").addEventListener("click", () => {
  document.getElementById("upgrade-modal").classList.remove("hidden");
});
