// api/webhook.js
import { buffer } from 'micro';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false, // 🚨 must disable bodyParser to use raw body
  },
};

// Simple database simulation (use real DB in production)
// Note: This won't persist in serverless - use Vercel KV, Upstash, or external DB
const userAccess = {};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  let event;
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, signingSecret);
    console.log('✅ Webhook verified:', event.type);
  } catch (err) {
    console.error(`❌ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout completion
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 1,
      });

      const productId = lineItems.data[0].price.product;
      const email = session.customer_email;

      const TIER1_ID = process.env.TIER1_PRODUCT_ID;
      const TIER2_ID = process.env.TIER2_PRODUCT_ID;

      if (productId === TIER1_ID) {
        console.log(`✅ Assigned Tier 1 access to ${email}`);
      } else if (productId === TIER2_ID) {
        console.log(`✅ Assigned Tier 2 access to ${email}`);
      } else {
        console.warn(`⚠️ Unknown product ID purchased by ${email}`);
      }

    } catch (err) {
      console.error('Error handling checkout.session.completed:', err.message);
      // Don't return 500 - always respond 200 to Stripe
    }
  }

  res.json({ received: true });
}
