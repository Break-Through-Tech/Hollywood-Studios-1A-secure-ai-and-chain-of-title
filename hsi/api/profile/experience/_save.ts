import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, id, company, jobTitle, startDate, endDate, description, companyEntityId } = req.body;

  if (!email || !company || !jobTitle) {
    return res.status(400).json({ error: 'email, company, and jobTitle are required' });
  }

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    // A linked entry puts the person on that company's page; the name follows the page's.
    let companyName = company;
    let companyId: number | null = null;
    if (companyEntityId) {
      const [linked] = await sql`SELECT id, title FROM entities WHERE id = ${Number(companyEntityId)} AND type = 'company'`;
      if (!linked) return res.status(400).json({ error: 'companyEntityId is not a company page' });
      companyName = linked.title;
      companyId = linked.id;
    }

    let experience;
    if (id) {
      [experience] = await sql`
        UPDATE experience SET company = ${companyName}, job_title = ${jobTitle},
          start_date = ${startDate || null}, end_date = ${endDate || null}, description = ${description || null},
          company_entity_id = ${companyId}
        WHERE id = ${id} AND profile_id = ${profile.id} RETURNING *
      `;
    } else {
      [experience] = await sql`
        INSERT INTO experience (profile_id, company, job_title, start_date, end_date, description, company_entity_id)
        VALUES (${profile.id}, ${companyName}, ${jobTitle}, ${startDate || null}, ${endDate || null}, ${description || null}, ${companyId})
        RETURNING *
      `;
    }
    return res.status(200).json({ experience });
  } catch (err) {
    console.error('Experience save error:', err);
    return res.status(500).json({ error: 'Failed to save experience' });
  }
}
