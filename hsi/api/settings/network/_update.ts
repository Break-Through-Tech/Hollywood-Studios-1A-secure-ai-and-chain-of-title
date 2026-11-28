import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, milestonesEnabled } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    await sql`INSERT INTO user_settings (email, milestones_enabled) VALUES (${email}, ${milestonesEnabled})
      ON CONFLICT (email) DO UPDATE SET milestones_enabled = ${milestonesEnabled}, updated_at = NOW()`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Network settings update error:', err);
    return res.status(500).json({ error: 'Failed to update network settings' });
  }
}
