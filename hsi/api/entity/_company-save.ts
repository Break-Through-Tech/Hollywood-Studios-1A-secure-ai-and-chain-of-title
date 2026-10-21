import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseCompanyInput, storeImage, uniqueCompanySlug } from './_company.js';

/**
 * Creates or updates a company page. A company always belongs to the member
 * who creates it: `created_by` is the caller's profile, and only that member
 * (or the admin) can change it afterwards.
 *
 * The body carries the whole form every time — fields left out are cleared —
 * except the images: `logoData` / `coverData` replace the image when they hold
 * a data URL, clear it when null, and leave it alone when absent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { email, id } = body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const parsed = parseCompanyInput(body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const c = parsed.value;

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    let existing: Record<string, unknown> | undefined;
    if (id !== undefined && id !== null) {
      [existing] = await sql`SELECT id, created_by, image_url FROM entities WHERE id = ${Number(id)} AND type = 'company'`;
      if (!existing) return res.status(404).json({ error: 'Company not found' });
      if (existing.created_by !== profile.id && email !== 'admin@hollywoodstudios.ai') {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    // Notable work is limited to titles that exist, in the order given.
    let notable: number[] = [];
    if (c.notableEntityIds.length) {
      const rows = await sql`
        SELECT id FROM entities WHERE id = ANY(${c.notableEntityIds}::int[]) AND type IN ('movie', 'tvshow', 'music')`;
      const found = new Set(rows.map(r => Number(r.id)));
      notable = c.notableEntityIds.filter(n => found.has(n));
    }

    const logo = await storeImage(body.logoData, 'companies/logos');
    if (logo && 'error' in logo) return res.status(400).json({ error: logo.error });
    const cover = await storeImage(body.coverData, 'companies/covers');
    if (cover && 'error' in cover) return res.status(400).json({ error: cover.error });

    const social = JSON.stringify(c.socialLinks);

    if (!existing) {
      // The entity and its details go in together, so there is never a
      // company without details or details without an owner.
      for (let attempt = 0; ; attempt++) {
        const slug = await uniqueCompanySlug(sql, c.name);
        try {
          const [entity] = await sql`
            WITH e AS (
              INSERT INTO entities (type, title, slug, year, image_url, description, created_by)
              VALUES ('company', ${c.name}, ${slug}, ${c.foundedYear}, ${logo?.url ?? null}, ${c.about}, ${profile.id})
              RETURNING *
            ), d AS (
              INSERT INTO company_details (entity_id, tagline, category, organization_type, company_size, founded_month,
                headquarters, website, contact_email, phone, specialties, social_links, cover_url, notable_entity_ids)
              SELECT id, ${c.tagline}, ${c.category}, ${c.organizationType}, ${c.companySize}, ${c.foundedMonth},
                ${c.headquarters}, ${c.website}, ${c.contactEmail}, ${c.phone}, ${c.specialties}::text[], ${social}::jsonb,
                ${cover?.url ?? null}, ${notable}::int[]
              FROM e
            )
            SELECT * FROM e`;
          return res.status(201).json({ entity });
        } catch (err) {
          // Two members naming a company the same thing at the same moment.
          if ((err as { code?: string }).code === '23505' && attempt < 2) continue;
          throw err;
        }
      }
    }

    const [entity] = await sql`
      WITH e AS (
        UPDATE entities SET
          title = ${c.name},
          year = ${c.foundedYear},
          image_url = ${logo ? logo.url : existing.image_url},
          description = ${c.about},
          updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING *
      ), d AS (
        INSERT INTO company_details (entity_id, tagline, category, organization_type, company_size, founded_month,
          headquarters, website, contact_email, phone, specialties, social_links, cover_url, notable_entity_ids, updated_at)
        SELECT id, ${c.tagline}, ${c.category}, ${c.organizationType}, ${c.companySize}, ${c.foundedMonth},
          ${c.headquarters}, ${c.website}, ${c.contactEmail}, ${c.phone}, ${c.specialties}::text[], ${social}::jsonb,
          ${cover ? cover.url : null}, ${notable}::int[], NOW()
        FROM e
        ON CONFLICT (entity_id) DO UPDATE SET
          tagline = EXCLUDED.tagline,
          category = EXCLUDED.category,
          organization_type = EXCLUDED.organization_type,
          company_size = EXCLUDED.company_size,
          founded_month = EXCLUDED.founded_month,
          headquarters = EXCLUDED.headquarters,
          website = EXCLUDED.website,
          contact_email = EXCLUDED.contact_email,
          phone = EXCLUDED.phone,
          specialties = EXCLUDED.specialties,
          social_links = EXCLUDED.social_links,
          cover_url = CASE WHEN ${cover === undefined}::boolean THEN company_details.cover_url ELSE EXCLUDED.cover_url END,
          notable_entity_ids = EXCLUDED.notable_entity_ids,
          updated_at = NOW()
      )
      SELECT * FROM e`;

    return res.status(200).json({ entity });
  } catch (err) {
    console.error('Company save error:', err);
    return res.status(500).json({ error: 'Failed to save company' });
  }
}
