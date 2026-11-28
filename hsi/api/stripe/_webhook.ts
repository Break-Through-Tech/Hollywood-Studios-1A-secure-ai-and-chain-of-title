import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const config = { api: { bodyParser: false } };

async function buffer(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

function tierFromPrice(priceId: string): string | null {
  if (priceId === process.env.STRIPE_STUDIO_PRICE_ID) return 'studio';
  if (priceId === process.env.STRIPE_STUDIO_MAX_PRICE_ID) return 'studio_max';
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) return res.status(400).json({ error: 'Missing signature' });

  let event: Stripe.Event;
  try {
    const body = await buffer(req);
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price?.id || '';
        const tier = tierFromPrice(priceId);
        const status = sub.status;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

        await sql`
          UPDATE user_settings
          SET subscription_id = ${sub.id},
              subscription_tier = ${tier},
              subscription_status = ${status},
              trial_end = ${trialEnd},
              updated_at = NOW()
          WHERE stripe_customer_id = ${customerId}
        `;
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await sql`
          UPDATE user_settings
          SET subscription_tier = NULL,
              subscription_status = 'canceled',
              subscription_id = NULL,
              updated_at = NOW()
          WHERE stripe_customer_id = ${customerId}
        `;
        break;
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  return res.status(200).json({ received: true });
}
