// api/webhook.js
const Stripe = require("stripe");

// helper to read raw body
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = [];
    req.on("data", (chunk) => data.push(chunk));
    req.on("end", () => resolve(Buffer.concat(data)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const buf = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(buf, sig, signingSecret);
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        console.log("✅ checkout.session.completed");
        break;
      case "payment_intent.succeeded":
        console.log("✅ payment_intent.succeeded");
        break;
      default:
        console.log(`ℹ️ Unhandled event: ${event.type}`);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("⚠️ Handler error:", e);
    return res.status(500).send("Server error");
  }
};
