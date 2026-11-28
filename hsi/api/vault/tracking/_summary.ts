import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;
  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    await ensureVaultTrackingTables(sql);
    const sessions = await sql`
      SELECT v.id, v.session_key, v.link_id, v.viewer_email, v.viewer_name,
             v.duration_seconds, v.max_scroll_pct, v.pages_viewed, v.total_pages,
             v.page_times, v.started_at, v.last_active_at,
             v.ip_country, v.ip_city, v.ip_region, v.version_number, v.download_count,
             l.label AS link_label
      FROM vault_view_sessions v
      LEFT JOIN vault_share_links l ON l.id = v.link_id
      WHERE v.script_id = ${script.id}
      ORDER BY v.started_at DESC
      LIMIT 200
    `;
    const notes = await sql`
      SELECT n.id, n.session_id, n.author_email, n.kind, n.target_email, n.content, n.created_at
      FROM vault_view_notes n
      WHERE n.script_id = ${script.id}
      ORDER BY n.created_at DESC
      LIMIT 200
    `;
    return res.status(200).json({ sessions, notes });
  } catch (err) {
    console.error('Tracking summary error:', err);
    return res.status(500).json({ error: 'Failed to load insights' });
  }
}
