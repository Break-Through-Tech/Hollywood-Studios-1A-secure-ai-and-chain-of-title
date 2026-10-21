import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id, awardName, category, year, result, project } = req.body;

  if (!email || !awardName) {
    return res.status(400).json({ error: 'email and awardName are required' });
  }

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    let award;
    if (id) {
      [award] = await sql`
        UPDATE awards SET award_name = ${awardName}, category = ${category || null},
          year = ${year || null}, result = ${result || 'Nominated'}, project = ${project || null}
        WHERE id = ${id} AND profile_id = ${profile.id} RETURNING *
      `;
    } else {
      [award] = await sql`
        INSERT INTO awards (profile_id, award_name, category, year, result, project)
        VALUES (${profile.id}, ${awardName}, ${category || null}, ${year || null}, ${result || 'Nominated'}, ${project || null})
        RETURNING *
      `;
    }
    return res.status(200).json({ award });
  } catch (err) {
    console.error('Awards save error:', err);
    return res.status(500).json({ error: 'Failed to save award' });
  }
}
