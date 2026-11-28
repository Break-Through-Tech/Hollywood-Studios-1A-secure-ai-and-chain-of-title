import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { query } = req.body;

  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query is required' });

  const q = query.trim();
  if (!q) return res.status(200).json({ profiles: [], entities: [] });

  const pattern = `%${q}%`;
  const prefix = `${q}%`;

  try {
    const [profiles, entities] = await Promise.all([
      sql`SELECT id, handle, display_name, headline, avatar_url, is_directory
          FROM profiles
          WHERE display_name ILIKE ${pattern} OR handle ILIKE ${pattern} OR headline ILIKE ${pattern}
          ORDER BY (display_name ILIKE ${prefix}) DESC, display_name
          LIMIT 24`,
      sql`SELECT id, type, title, slug, year, image_url
          FROM entities
          WHERE title ILIKE ${pattern}
          ORDER BY title
          LIMIT 20`,
    ]);

    return res.status(200).json({ profiles, entities });
  } catch (err) {
    console.error('Search query error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
