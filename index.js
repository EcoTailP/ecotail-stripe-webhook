const express = require('express');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Use raw body parser for webhooks, JSON for everything else
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(bodyParser.json());

// In-memory access tracking (replace with DB later if needed)
const userAccess = {};

// ✅ PaymentIntent with $0.99 app fee
app.post('/create-payment-intent', async (req, res) => {
  const { amount, connectedAccountId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card_present', 'card'],
      application_fee_amount: 99, // $0.99 in cents
      transfer_data: {
        destination: connectedAccountId,
      },
    });

    res.json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Error creating PaymentIntent:', err);
    res.status(500).send({ error: 'Payment creation failed' });
  }
});

// ✅ Webhook for tier access control
app.post('/webhook', async (req, res) => {
  let event;
  const sig = req.headers['stripe-signature'];
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    // Always respond 200 to Stripe to avoid retries
    return res.status(200).send('Webhook received (signature error)');
  }

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
        userAccess[email] = 'Tier 1';
        console.log(`✅ Assigned Tier 1 access to ${email}`);
      } else if (productId === TIER2_ID) {
        userAccess[email] = 'Tier 2';
        console.log(`✅ Assigned Tier 2 access to ${email}`);
      } else {
        console.warn(`⚠️ Unknown product ID purchased by ${email}`);
      }
    } catch (err) {
      console.error('Error handling checkout.session.completed:', err.message);
      // Do not send 500, always respond 200
    }
    return res.status(200).send('Webhook processed');
  }
  // For all other events, respond 200
  return res.status(200).send('Webhook received');
});

// ✅ View access status by email
app.get('/access/:email', (req, res) => {
  const email = req.params.email;
  const access = userAccess[email] || 'No access assigned';
  res.json({ email, access });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
