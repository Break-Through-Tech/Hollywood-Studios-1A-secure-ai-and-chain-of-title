import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Everything the Projects tab renders, in one round trip.
 *
 * "Trending today" is real traffic from entity_views. Until a title has been
 * viewed it has nothing to rank, so the response says which basis was used and
 * the UI labels the section accordingly rather than passing a proxy off as
 * live traffic.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { genre, decade, query, limit } = req.body ?? {};
  const browseLimit = Math.min(Number(limit) || 24, 60);

  try {
    const [trendingRows, featured, recent, genres, totals] = await Promise.all([
      sql`SELECT e.id, e.title, e.slug, e.year, e.image_url, e.genre,
                 COUNT(v.id)::int AS views
          FROM entity_views v
          JOIN entities e ON e.id = v.entity_id
          WHERE v.viewed_at > NOW() - INTERVAL '24 hours'
          GROUP BY e.id
          ORDER BY COUNT(v.id) DESC, e.year DESC NULLS LAST
          LIMIT 12`,

      // Most-credited titles: the ones the directory actually connects to.
      sql`SELECT e.id, e.title, e.slug, e.year, e.image_url, e.genre,
                 COUNT(c.id)::int AS credit_count
          FROM entities e
          JOIN credits c ON c.entity_id = e.id
          WHERE e.type = 'movie' AND e.image_url IS NOT NULL
          GROUP BY e.id
          ORDER BY COUNT(c.id) DESC, e.year DESC NULLS LAST
          LIMIT 12`,

      sql`SELECT e.id, e.title, e.slug, e.year, e.image_url, e.genre,
                 COUNT(c.id)::int AS credit_count
          FROM entities e
          LEFT JOIN credits c ON c.entity_id = e.id
          WHERE e.type = 'movie' AND e.image_url IS NOT NULL
            AND e.year IS NOT NULL AND e.year <= EXTRACT(YEAR FROM NOW())
          GROUP BY e.id
          ORDER BY e.year DESC, COUNT(c.id) DESC
          LIMIT 12`,

      sql`SELECT g AS name, COUNT(*)::int AS n
          FROM entities e, UNNEST(e.genre) g
          WHERE e.type = 'movie'
          GROUP BY g HAVING COUNT(*) >= 12
          ORDER BY COUNT(*) DESC LIMIT 18`,

      sql`SELECT COUNT(*)::int AS titles,
                 COUNT(image_url)::int AS with_art,
                 (SELECT COUNT(*)::int FROM credits) AS credits,
                 (SELECT COUNT(*)::int FROM profiles WHERE is_directory) AS people
          FROM entities WHERE type = 'movie'`,
    ]);

    // Browse grid, filtered by the controls the page exposes.
    const pattern = query ? `%${String(query).trim()}%` : null;
    const minYear = decade ? Number(decade) : null;
    const browse = await sql`
      SELECT e.id, e.title, e.slug, e.year, e.image_url, e.genre,
             COUNT(c.id)::int AS credit_count
      FROM entities e
      LEFT JOIN credits c ON c.entity_id = e.id
      WHERE e.type = 'movie'
        AND e.image_url IS NOT NULL
        AND (${pattern}::text IS NULL OR e.title ILIKE ${pattern})
        AND (${genre ?? null}::text IS NULL OR ${genre ?? null} = ANY(e.genre))
        AND (${minYear}::int IS NULL OR (e.year >= ${minYear} AND e.year < ${minYear} + 10))
      GROUP BY e.id
      ORDER BY COUNT(c.id) DESC, e.year DESC NULLS LAST
      LIMIT ${browseLimit}`;

    return res.status(200).json({
      trending: trendingRows,
      trendingBasis: trendingRows.length > 0 ? 'views' : 'none',
      featured,
      recent,
      genres,
      browse,
      totals: totals[0],
    });
  } catch (err) {
    console.error('Projects overview error:', err);
    return res.status(500).json({ error: 'Failed to load projects' });
  }
}
