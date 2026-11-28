import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, targetHandle } = req.body;

  if (!email || !targetHandle) return res.status(400).json({ error: 'email and targetHandle are required' });

  try {
    const [from] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!from) return res.status(403).json({ error: 'Profile not found' });

    const [to] = await sql`SELECT id FROM profiles WHERE handle = ${targetHandle}`;
    if (!to) return res.status(404).json({ error: 'Target profile not found' });

    if (from.id === to.id) return res.status(400).json({ error: 'Cannot connect to yourself' });

    const existing = await sql`
      SELECT id FROM connections
      WHERE (from_profile = ${from.id} AND to_profile = ${to.id})
         OR (from_profile = ${to.id} AND to_profile = ${from.id})
    `;
    if (existing.length > 0) return res.status(409).json({ error: 'Connection already exists' });

    await sql`INSERT INTO connections (from_profile, to_profile, status) VALUES (${from.id}, ${to.id}, 'accepted')`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Connect error:', err);
    return res.status(500).json({ error: 'Failed to connect' });
  }
}
