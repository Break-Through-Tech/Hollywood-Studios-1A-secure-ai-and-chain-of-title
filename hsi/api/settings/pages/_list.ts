import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const pages = await sql`SELECT * FROM user_pages WHERE owner_email = ${email} ORDER BY created_at DESC`;
    return res.status(200).json(pages);
  } catch (err) {
    console.error('Pages list error:', err);
    return res.status(500).json({ error: 'Failed to load pages' });
  }
}
