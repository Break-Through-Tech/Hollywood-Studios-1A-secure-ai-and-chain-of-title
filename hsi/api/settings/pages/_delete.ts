import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id } = req.body;
  if (!email || !id) return res.status(400).json({ error: 'email and id are required' });

  try {
    await sql`DELETE FROM user_pages WHERE id = ${id} AND owner_email = ${email}`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Pages delete error:', err);
    return res.status(500).json({ error: 'Failed to delete page' });
  }
}
