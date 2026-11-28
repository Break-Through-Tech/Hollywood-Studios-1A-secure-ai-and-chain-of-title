import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, targetId } = req.body;

  if (!email || !targetId) return res.status(400).json({ error: 'email and targetId are required' });

  try {
    const [from] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!from) return res.status(403).json({ error: 'Profile not found' });

    const [to] = await sql`SELECT id, is_directory FROM profiles WHERE id = ${targetId}`;
    if (!to) return res.status(404).json({ error: 'Target not found' });
    if (to.is_directory) return res.status(400).json({ error: 'Cannot connect to a reference profile' });

    if (from.id === to.id) return res.status(400).json({ error: 'Cannot connect to yourself' });

    const existing = await sql`
      SELECT id, status FROM connections
      WHERE (from_profile = ${from.id} AND to_profile = ${to.id})
         OR (from_profile = ${to.id} AND to_profile = ${from.id})
    `;
    if (existing.length > 0) return res.status(409).json({ error: 'Connection already exists', status: existing[0].status });

    await sql`INSERT INTO connections (from_profile, to_profile, status) VALUES (${from.id}, ${to.id}, 'pending')`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Connection request error:', err);
    return res.status(500).json({ error: 'Failed to send request' });
  }
}
