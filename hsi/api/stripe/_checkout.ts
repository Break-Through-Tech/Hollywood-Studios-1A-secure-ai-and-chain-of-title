import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_IDS: Record<string, string> = {
  studio: process.env.STRIPE_STUDIO_PRICE_ID!,
  studio_max: process.env.STRIPE_STUDIO_MAX_PRICE_ID!,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, tier } = req.body;
  if (!email || !tier) return res.status(400).json({ error: 'email and tier are required' });

  const priceId = PRICE_IDS[tier];
  if (!priceId) return res.status(400).json({ error: 'Invalid tier' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [settings] = await sql`SELECT stripe_customer_id FROM user_settings WHERE email = ${email}`;
    let customerId = settings?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await sql`UPDATE user_settings SET stripe_customer_id = ${customerId} WHERE email = ${email}`;
    }

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${origin}/network?upgrade=success`,
      cancel_url: `${origin}/network?upgrade=canceled`,
      metadata: { email, tier },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
