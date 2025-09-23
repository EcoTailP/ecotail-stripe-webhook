import Stripe from 'stripe';
import { setUserAccess } from './access.js'; // Ensure correct filename/case

export const config = {
  api: {
    bodyParser: false, // Required for Stripe signature verification
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      console.error('❌ Missing Stripe signature header');
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }

    // Get raw body
    const rawBody = await buffer(req);

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const productId = session.metadata?.product_id;

      console.log(`✅ Checkout complete for ${email}, product ${productId}`);

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

    // Optional: log unhandled event types
    else {
      console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('❌ Webhook crashed:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

// Helper: collect raw body
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
