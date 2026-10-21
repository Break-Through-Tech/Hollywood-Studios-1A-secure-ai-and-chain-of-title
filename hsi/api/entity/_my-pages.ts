import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(200).json([]);

    const entities = await sql`SELECT id, type, title, slug, image_url, year FROM entities WHERE created_by = ${profile.id} ORDER BY created_at DESC`;
    return res.status(200).json(entities);
  } catch (err) {
    console.error('My pages error:', err);
    return res.status(500).json({ error: 'Failed to fetch pages' });
  }
}
