import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id, aiWatching, privacy } = req.body;
  if (!email || !id) return res.status(400).json({ error: 'email and id are required' });

  try {
    if (aiWatching !== undefined) {
      await sql`UPDATE user_pages SET ai_watching = ${aiWatching} WHERE id = ${id} AND owner_email = ${email}`;
    }
    if (privacy !== undefined) {
      await sql`UPDATE user_pages SET privacy = ${privacy} WHERE id = ${id} AND owner_email = ${email}`;
    }
    const [page] = await sql`SELECT * FROM user_pages WHERE id = ${id} AND owner_email = ${email}`;
    return res.status(200).json(page);
  } catch (err) {
    console.error('Pages update error:', err);
    return res.status(500).json({ error: 'Failed to update page' });
  }
}
