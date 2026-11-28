import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { query, type } = req.body;

  if (!query) return res.status(400).json({ error: 'query is required' });

  try {
    const pattern = `%${query}%`;
    let results;
    if (type) {
      results = await sql`SELECT id, type, title, slug, year, image_url FROM entities WHERE title ILIKE ${pattern} AND type = ${type} ORDER BY title LIMIT 10`;
    } else {
      results = await sql`SELECT id, type, title, slug, year, image_url FROM entities WHERE title ILIKE ${pattern} ORDER BY title LIMIT 10`;
    }
    return res.status(200).json(results);
  } catch (err) {
    console.error('Entity search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
