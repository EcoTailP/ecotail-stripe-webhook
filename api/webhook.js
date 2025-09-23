import Stripe from 'stripe';
import { Readable } from 'stream';
import { setUserAccess } from './access'; // <-- connect to access.js

export const config = {
  api: {
    bodyParser: false, // ❗ Required for Stripe signature verification
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // 1️⃣ Retrieve email and product/tier from the session
    const email = session.customer_details?.email;
    const productId = session.metadata?.product_id; // you set this when creating the Checkout Session

    console.log(`✅ Checkout complete for ${email}, product ${productId}`);

    // 2️⃣ Update in-memory access (TEMP only)
    if (email && productId) {
      if (productId === process.env.TIER1_PRODUCT_ID) {
        setUserAccess(email, 'Tier 1');
      } else if (productId === process.env.TIER2_PRODUCT_ID) {
        setUserAccess(email, 'Tier 2');
      } else {
        setUserAccess(email, 'Unknown product');
      }
    }
  }

  res.status(200).end();
}

// Helper to collect the raw body for Stripe verification
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
