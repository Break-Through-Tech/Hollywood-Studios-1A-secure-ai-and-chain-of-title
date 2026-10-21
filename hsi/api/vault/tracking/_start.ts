import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables, generateToken } from '../_schema.js';
import { extractGeo } from './_gates.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  // link-token sessions are created exclusively by tracking/unlock after all gates pass
  const { slug, viewerEmail, viewerName } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!viewerEmail) return res.status(400).json({ error: 'viewerEmail is required' });

  try {
    await ensureVaultTrackingTables(sql);

    const [script] = await sql`
      SELECT s.id, s.owner_email, s.current_version,
        EXISTS(
          SELECT 1 FROM vault_shares sh
          WHERE sh.script_id = s.id AND LOWER(sh.shared_with) = LOWER(${viewerEmail})
        ) AS has_share
      FROM vault_scripts s
      WHERE s.slug = ${slug}
    `;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    // don't record the owner previewing their own project
    if (viewerEmail.toLowerCase() === String(script.owner_email).toLowerCase()) {
      return res.status(200).json({ sessionKey: null });
    }
    if (!script.has_share) return res.status(403).json({ error: 'Not authorized' });

    const geo = extractGeo(req);
    const sessionKey = generateToken();
    await sql`
      INSERT INTO vault_view_sessions
        (session_key, script_id, viewer_email, viewer_name, user_agent,
         ip_country, ip_city, ip_region, version_number)
      VALUES (${sessionKey}, ${script.id}, ${viewerEmail || null}, ${viewerName || null},
              ${req.headers['user-agent'] || null}, ${geo.country}, ${geo.city}, ${geo.region},
              ${script.current_version || 1})
    `;
    return res.status(200).json({ sessionKey });
  } catch (err) {
    console.error('Tracking start error:', err);
    return res.status(500).json({ error: 'Failed to start session' });
  }
}
