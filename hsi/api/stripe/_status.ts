import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [settings] = await sql`
      SELECT subscription_tier, subscription_status, trial_end
      FROM user_settings WHERE email = ${email}
    `;

    return res.status(200).json({
      tier: settings?.subscription_tier || null,
      status: settings?.subscription_status || null,
      trialEnd: settings?.trial_end || null,
    });
  } catch (err) {
    console.error('Stripe status error:', err);
    return res.status(500).json({ error: 'Failed to get subscription status' });
  }
}
