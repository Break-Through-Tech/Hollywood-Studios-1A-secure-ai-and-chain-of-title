import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    let settings = (await sql`SELECT milestones_enabled FROM user_settings WHERE email = ${email}`)[0];
    if (!settings) {
      await sql`INSERT INTO user_settings (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
      settings = { milestones_enabled: true };
    }
    return res.status(200).json(settings);
  } catch (err) {
    console.error('Network settings get error:', err);
    return res.status(500).json({ error: 'Failed to load network settings' });
  }
}
