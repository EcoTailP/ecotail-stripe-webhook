const express = require('express');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const logger = require('./logger');

dotenv.config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Simple request ID middleware for correlation
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || Math.random().toString(36).slice(2, 10);
  res.setHeader('x-request-id', req.id);
  next();
});

// Use raw body parser for webhooks, JSON for everything else
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(bodyParser.json());

// Basic request logger (avoid logging sensitive bodies)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// In-memory access tracking (replace with DB later if needed)
const userAccess = {};

// ✅ PaymentIntent with $0.99 app fee
app.post('/create-payment-intent', async (req, res) => {
  const { amount, connectedAccountId } = req.body;

  // Basic validation (consider deriving connectedAccountId server-side for security)
  if (!connectedAccountId) {
    return res.status(400).send({ error: 'connectedAccountId is required' });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).send({ error: 'amount must be a positive integer in cents' });
  }

  try {
    // Direct charge: create the PaymentIntent on the connected account.
    // Note: application_fee_amount works for Express/Custom; not permitted for Standard accounts.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        payment_method_types: ['card_present', 'card'],
        application_fee_amount: 99, // $0.99 in cents kept by the platform
      },
      {
        stripeAccount: connectedAccountId,
      }
    );

    res.json({ id: paymentIntent.id, client_secret: paymentIntent.client_secret });
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
    logger.info('webhook_verified', { reqId: req.id, type: event.type });
  } catch (err) {
    logger.warn('webhook_signature_error', { reqId: req.id, message: err.message });
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
        logger.info('tier_assigned', { reqId: req.id, email, tier: 'Tier 1' });
      } else if (productId === TIER2_ID) {
        userAccess[email] = 'Tier 2';
        logger.info('tier_assigned', { reqId: req.id, email, tier: 'Tier 2' });
      } else {
        logger.warn('unknown_product', { reqId: req.id, email, productId });
      }
    } catch (err) {
      logger.error('webhook_processing_error', { reqId: req.id, message: err.message, err });
      // Do not send 500, always respond 200
    }
    return res.status(200).send('Webhook processed');
  }
  // For all other events, respond 200
  logger.debug('webhook_ignored_event', { reqId: req.id, type: event.type });
  return res.status(200).send('Webhook received');
});

// ✅ View access status by email
app.get('/access/:email', (req, res) => {
  const email = req.params.email;
  const access = userAccess[email] || 'No access assigned';
  logger.debug('access_lookup', { reqId: req.id, email, access });
  res.json({ email, access });
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  logger.info('server_started', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY),
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  });
});
