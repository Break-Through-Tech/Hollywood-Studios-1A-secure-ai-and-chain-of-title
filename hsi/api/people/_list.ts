import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const [me] = await sql`SELECT id, skills FROM profiles WHERE email = ${email}`;
    if (!me) return res.status(403).json({ error: 'Profile not found' });

    const mySkills: string[] = Array.isArray(me.skills) ? me.skills.map((s: string) => s.toLowerCase()) : [];

    // Members only — connection state is meaningless for directory entries.
    const profiles = await sql`
      SELECT p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.skills, p.location,
             FALSE AS is_directory, NULL::text AS department, 0 AS credit_count,
             COALESCE(
               (SELECT c.status FROM connections c
                WHERE (c.from_profile = ${me.id} AND c.to_profile = p.id)
                   OR (c.from_profile = p.id AND c.to_profile = ${me.id})
                LIMIT 1),
               'none'
             ) AS connection_status,
             CASE
               WHEN EXISTS (SELECT 1 FROM connections c WHERE c.from_profile = ${me.id} AND c.to_profile = p.id AND c.status = 'pending')
               THEN 'sent'
               WHEN EXISTS (SELECT 1 FROM connections c WHERE c.from_profile = p.id AND c.to_profile = ${me.id} AND c.status = 'pending')
               THEN 'received'
               ELSE NULL
             END AS request_direction
      FROM profiles p
      WHERE p.id != ${me.id} AND p.is_directory = FALSE
      ORDER BY p.display_name ASC
    `;

    const scored = profiles.map((p: Record<string, unknown>) => {
      const theirSkills: string[] = Array.isArray(p.skills) ? (p.skills as string[]).map(s => s.toLowerCase()) : [];
      const shared = mySkills.filter(s => theirSkills.includes(s)).length;
      return { ...p, relevance: shared };
    });

    scored.sort((a: { relevance: number }, b: { relevance: number }) => b.relevance - a.relevance);

    // Directory entries are public reference profiles: browsable and searchable
    // here, but not connectable, so they carry no connection state.
    const directory = await sql`
      SELECT p.id, p.handle, p.display_name, p.headline, p.avatar_url, p.skills, p.location,
             TRUE AS is_directory,
             MIN(c.department) AS department,
             COUNT(c.id)::int AS credit_count
      FROM profiles p
      LEFT JOIN credits c ON c.profile_id = p.id
      WHERE p.is_directory = TRUE
      GROUP BY p.id
      ORDER BY COUNT(c.id) DESC, p.display_name ASC
    `;

    return res.status(200).json({ people: scored, directory });
  } catch (err) {
    console.error('People list error:', err);
    return res.status(500).json({ error: 'Failed to load people' });
  }
}
