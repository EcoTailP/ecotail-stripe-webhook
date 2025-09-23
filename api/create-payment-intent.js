import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20', // always set an explicit version
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { amount, connectedAccountId } = req.body;

    if (!amount || !connectedAccountId) {
      return res.status(400).json({ error: 'Missing amount or connectedAccountId' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,                  // amount in cents (e.g. $10.00 → 1000)
      currency: 'usd',
      payment_method_types: ['card'],
      application_fee_amount: 99, // 99 cents platform fee
      transfer_data: {
        destination: connectedAccountId, // Stripe Connect account ID
      },
    });

    res.status(200).json({ client_secret: paymentIntent.client_secret });
  } catch (err) {
    console.error('❌ Error creating PaymentIntent:', err);
    res.status(500).json({ error: 'Payment creation failed' });
  }
}
