import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Records a view of an entity page, so Projects can rank by real traffic.
 *
 * The viewer key is a salted hash of IP + user agent, kept only to collapse
 * repeat hits from the same person within the hour — it is not reversible and
 * no raw address is stored.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug } = req.body ?? {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  try {
    const [entity] = await sql`SELECT id FROM entities WHERE slug = ${slug}`;
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
    const viewerKey = createHash('sha256')
      .update(`${ip}|${req.headers['user-agent'] || ''}|${process.env.DATABASE_URL?.slice(-12) || ''}`)
      .digest('hex')
      .slice(0, 32);

    // One view per viewer per entity per hour keeps refreshes from inflating counts.
    const [recent] = await sql`
      SELECT 1 FROM entity_views
      WHERE entity_id = ${entity.id} AND viewer_key = ${viewerKey}
        AND viewed_at > NOW() - INTERVAL '1 hour'
      LIMIT 1`;
    if (!recent) {
      await sql`INSERT INTO entity_views (entity_id, viewer_key) VALUES (${entity.id}, ${viewerKey})`;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Entity view error:', err);
    // Never fail the page over analytics.
    return res.status(200).json({ ok: false });
  }
}
