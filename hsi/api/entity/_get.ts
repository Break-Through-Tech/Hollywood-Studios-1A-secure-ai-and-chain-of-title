import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionEmail } from '../_session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug } = req.body;

  if (!slug) return res.status(400).json({ error: 'slug is required' });

  try {
    const [entity] = await sql`
      SELECT e.*, p.display_name AS creator_name, p.handle AS creator_handle, p.email AS creator_email
      FROM entities e LEFT JOIN profiles p ON e.created_by = p.id
      WHERE e.slug = ${slug}
    `;
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    // Decided here, from the session, so the page never offers an edit the API would refuse.
    const sessionEmail = await getSessionEmail(sql, req);
    const canEdit = !!sessionEmail && (sessionEmail === entity.creator_email || sessionEmail === 'admin@hollywoodstudios.ai');
    delete entity.creator_email;

    if (entity.type === 'company') return res.status(200).json({ entity, canEdit, ...(await companyExtras(sql, entity)) });

    const castCrew = await sql`
      SELECT c.department, c.role, c.year, p.display_name, p.handle, p.avatar_url, p.headline
      FROM credits c JOIN profiles p ON c.profile_id = p.id
      WHERE c.entity_id = ${entity.id}
      ORDER BY c.department, c.sort_order
    `;

    return res.status(200).json({ entity, castCrew, canEdit });
  } catch (err) {
    console.error('Entity get error:', err);
    return res.status(500).json({ error: 'Failed to fetch entity' });
  }
}

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

async function companyExtras(sql: Sql, entity: Record<string, unknown>) {
  const [detailsRows, ownerRows, people] = await Promise.all([
    sql`SELECT * FROM company_details WHERE entity_id = ${entity.id}`,
    sql`SELECT handle, display_name, avatar_url, headline FROM profiles WHERE id = ${entity.created_by}`,
    // One row per person: their current role here if they have one, else their latest.
    sql`
      SELECT * FROM (
        SELECT DISTINCT ON (p.id)
          p.handle, p.display_name, p.avatar_url, p.headline,
          x.job_title, x.start_date, x.end_date, (x.end_date IS NULL) AS is_current
        FROM experience x JOIN profiles p ON p.id = x.profile_id
        WHERE x.company_entity_id = ${entity.id}
        ORDER BY p.id, (x.end_date IS NULL) DESC, x.start_date DESC NULLS LAST
      ) t
      ORDER BY is_current DESC, start_date ASC NULLS LAST, display_name
      LIMIT 60`,
  ]);

  const details = detailsRows[0] ?? null;
  const ids = ((details?.notable_entity_ids as number[] | undefined) ?? []);
  const notableWork = ids.length
    ? await sql`
        SELECT e.id, e.type, e.title, e.slug, e.year, e.image_url
        FROM entities e JOIN UNNEST(${ids}::int[]) WITH ORDINALITY AS o(id, n) ON o.id = e.id
        ORDER BY o.n`
    : [];

  return { company: details, owner: ownerRows[0] ?? null, people, notableWork };
}
