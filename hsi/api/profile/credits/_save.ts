import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, credits } = req.body;

  if (!email || !Array.isArray(credits)) {
    return res.status(400).json({ error: 'email and credits array are required' });
  }

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    await sql`DELETE FROM credits WHERE profile_id = ${profile.id}`;

    for (const c of credits) {
      await sql`
        INSERT INTO credits (profile_id, department, title, year, role, work_type, sort_order, entity_id)
        VALUES (${profile.id}, ${c.department}, ${c.title}, ${c.year || null}, ${c.role || null}, ${c.workType || null}, ${c.sortOrder || 0}, ${c.entityId || null})
      `;
    }

    const saved = await sql`SELECT * FROM credits WHERE profile_id = ${profile.id} ORDER BY department, sort_order, year DESC`;
    return res.status(200).json({ credits: saved });
  } catch (err) {
    console.error('Credits save error:', err);
    return res.status(500).json({ error: 'Failed to save credits' });
  }
}
