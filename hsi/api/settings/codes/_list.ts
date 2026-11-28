import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const codes = await sql`SELECT * FROM access_codes WHERE owner_email = ${email} ORDER BY created_at DESC`;
    const [{ members }] = await sql`SELECT COUNT(*)::int AS members FROM access_codes WHERE owner_email = ${email} AND used = true AND invited_email IS NOT NULL`;
    return res.status(200).json({ codes, members, followers: 0 });
  } catch (err) {
    console.error('Codes list error:', err);
    return res.status(500).json({ error: 'Failed to load codes' });
  }
}
