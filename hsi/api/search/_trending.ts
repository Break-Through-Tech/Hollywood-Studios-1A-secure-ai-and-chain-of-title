import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [profiles, actors, entities] = await Promise.all([
      sql`SELECT p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.is_directory
          FROM profiles p
          LEFT JOIN posts po ON po.profile_id = p.id
          WHERE p.is_directory = FALSE
          GROUP BY p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.is_directory
          ORDER BY COUNT(po.id) DESC, p.created_at DESC
          LIMIT 5`,
      // Seeded reference profiles. Ranked within each department and then
      // interleaved, so the panel shows the breadth of the directory rather
      // than whichever department happens to carry the most credits.
      sql`SELECT id, handle, display_name, headline, avatar_url, is_directory, credit_count, department
          FROM (
            SELECT p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.is_directory,
                   COUNT(c.id)::int AS credit_count,
                   MIN(c.department) AS department,
                   ROW_NUMBER() OVER (PARTITION BY MIN(c.department) ORDER BY COUNT(c.id) DESC) AS rank
            FROM profiles p
            JOIN credits c ON c.profile_id = p.id
            WHERE p.is_directory = TRUE AND p.avatar_url IS NOT NULL
            GROUP BY p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.is_directory
          ) ranked
          WHERE rank <= 3
          ORDER BY rank, credit_count DESC
          LIMIT 12`,
      // Titles carrying the most linked credits read as the busiest pages.
      sql`SELECT e.id, e.type, e.title, e.slug, e.year, e.image_url
          FROM entities e
          LEFT JOIN credits c ON c.entity_id = e.id
          GROUP BY e.id, e.type, e.title, e.slug, e.year, e.image_url
          ORDER BY COUNT(c.id) DESC, e.created_at DESC
          LIMIT 12`,
    ]);

    return res.status(200).json({ profiles, actors, entities });
  } catch (err) {
    console.error('Search trending error:', err);
    return res.status(500).json({ error: 'Failed to load trending' });
  }
}
