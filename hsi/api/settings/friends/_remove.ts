import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, friendshipId } = req.body;
  if (!email || !friendshipId) return res.status(400).json({ error: 'email and friendshipId are required' });

  try {
    const [me] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!me) return res.status(403).json({ error: 'Profile not found' });

    await sql`DELETE FROM connections WHERE id = ${friendshipId} AND (from_profile = ${me.id} OR to_profile = ${me.id})`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Connection remove error:', err);
    return res.status(500).json({ error: 'Failed to remove connection' });
  }
}
