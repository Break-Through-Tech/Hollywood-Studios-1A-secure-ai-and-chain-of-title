import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, fromProfileId, action } = req.body;

  if (!email || !fromProfileId || !action) return res.status(400).json({ error: 'email, fromProfileId, and action are required' });
  if (action !== 'accept' && action !== 'decline') return res.status(400).json({ error: 'action must be accept or decline' });

  try {
    const [me] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!me) return res.status(403).json({ error: 'Profile not found' });

    const [conn] = await sql`
      SELECT id FROM connections
      WHERE from_profile = ${fromProfileId} AND to_profile = ${me.id} AND status = 'pending'
    `;
    if (!conn) return res.status(404).json({ error: 'No pending request found' });

    if (action === 'accept') {
      await sql`UPDATE connections SET status = 'accepted' WHERE id = ${conn.id}`;
    } else {
      await sql`DELETE FROM connections WHERE id = ${conn.id}`;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Connection respond error:', err);
    return res.status(500).json({ error: 'Failed to respond to request' });
  }
}
