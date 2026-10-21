import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { handle } = req.body;

  if (!handle) return res.status(400).json({ error: 'Handle is required' });

  try {
    const [profile] = await sql`SELECT * FROM profiles WHERE handle = ${handle}`;
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Independent of one another — issued together so the page costs one round trip, not five.
    const [credits, experience, awards, connectionRows, createdPages] = await Promise.all([
      sql`SELECT c.*, e.type AS entity_type, e.slug AS entity_slug, e.image_url AS entity_image_url FROM credits c LEFT JOIN entities e ON c.entity_id = e.id WHERE c.profile_id = ${profile.id} ORDER BY c.department, c.sort_order, c.year DESC`,
      sql`SELECT x.*, e.slug AS company_slug, e.image_url AS company_logo_url
          FROM experience x LEFT JOIN entities e ON e.id = x.company_entity_id
          WHERE x.profile_id = ${profile.id} ORDER BY x.sort_order, x.end_date DESC NULLS FIRST`,
      sql`SELECT * FROM awards WHERE profile_id = ${profile.id} ORDER BY year DESC`,
      sql`
        SELECT p.handle, p.display_name, p.headline, p.avatar_url
        FROM connections c
        JOIN profiles p ON (
          CASE WHEN c.from_profile = ${profile.id} THEN c.to_profile ELSE c.from_profile END = p.id
        )
        WHERE (c.from_profile = ${profile.id} OR c.to_profile = ${profile.id})
          AND c.status = 'accepted'
      `,
      sql`SELECT id, type, title, slug, image_url, year FROM entities WHERE created_by = ${profile.id} ORDER BY created_at DESC`,
    ]);

    return res.status(200).json({
      profile,
      credits,
      experience,
      awards,
      connections: connectionRows,
      createdPages,
    });
  } catch (err) {
    console.error('Profile get error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}
