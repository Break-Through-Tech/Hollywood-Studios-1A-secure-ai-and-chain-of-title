import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, friendshipId, action } = req.body;
  if (!email || !friendshipId || !action) return res.status(400).json({ error: 'email, friendshipId, and action are required' });

  try {
    const [me] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!me) return res.status(403).json({ error: 'Profile not found' });

    if (action === 'accept') {
      await sql`UPDATE connections SET status = 'accepted' WHERE id = ${friendshipId} AND to_profile = ${me.id}`;
    } else {
      await sql`DELETE FROM connections WHERE id = ${friendshipId} AND to_profile = ${me.id}`;
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Connection respond error:', err);
    return res.status(500).json({ error: 'Failed to respond' });
  }
}
