import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Credits shown on a featured card — enough to place the person, not a filmography. */
const CREDITS_PER_PERSON = 4;

/**
 * The current featured cohort: whichever week_start is latest, regardless of
 * today's date. A selection therefore stays up until it is replaced rather than
 * disappearing when the calendar week turns over.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [current] = await sql`SELECT max(week_start)::text AS week FROM featured_profiles`;
    if (!current?.week) return res.status(200).json({ weekStart: null, profiles: [] });

    const profiles = await sql`
      SELECT p.id, p.handle, p.display_name, p.headline, p.bio, p.location,
             p.avatar_url, p.skills, p.is_directory, p.source, p.source_url,
             f.blurb, f.sort_order,
             (SELECT COUNT(*)::int FROM credits c WHERE c.profile_id = p.id) AS credit_count
      FROM featured_profiles f
      JOIN profiles p ON p.id = f.profile_id
      WHERE f.week_start = ${current.week}
      ORDER BY f.sort_order, p.display_name`;

    // Top credits for every featured person in one round trip — the cohort is
    // small, but a query per card would still be a query per card.
    const ids = profiles.map((p) => p.id as number);
    const credits = ids.length === 0 ? [] : await sql`
      SELECT profile_id, title, year, role, work_type, entity_id,
             entity_type, entity_slug, entity_image_url
      FROM (
        SELECT c.profile_id, c.title, c.year, c.role, c.work_type, c.entity_id,
               e.type AS entity_type, e.slug AS entity_slug, e.image_url AS entity_image_url,
               -- Newest released work first. A filmography is stored with
               -- unreleased titles at the top, which is right on a profile and
               -- wrong here: the spotlight should lead with work people know.
               ROW_NUMBER() OVER (
                 PARTITION BY c.profile_id
                 ORDER BY c.year DESC NULLS LAST, c.sort_order
               ) AS rank
        FROM credits c
        LEFT JOIN entities e ON e.id = c.entity_id
        WHERE c.profile_id = ANY(${ids}::int[])
      ) ranked
      WHERE rank <= ${CREDITS_PER_PERSON}
      ORDER BY profile_id, rank`;

    return res.status(200).json({
      weekStart: current.week,
      profiles: profiles.map((p) => ({
        ...p,
        credits: credits.filter((c) => c.profile_id === p.id),
      })),
    });
  } catch (err) {
    console.error('Featured profiles error:', err);
    return res.status(500).json({ error: 'Failed to load featured profiles' });
  }
}
