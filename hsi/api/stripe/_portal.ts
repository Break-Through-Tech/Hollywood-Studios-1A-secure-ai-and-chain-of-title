import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [settings] = await sql`SELECT stripe_customer_id FROM user_settings WHERE email = ${email}`;
    if (!settings?.stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';

    const session = await stripe.billingPortal.sessions.create({
      customer: settings.stripe_customer_id,
      return_url: `${origin}/network`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    return res.status(500).json({ error: 'Failed to create portal session' });
  }
}
