import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;
  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    await ensureVaultTrackingTables(sql);
    const [script] = await sql`SELECT id, current_version FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });
    const versions = await sql`
      SELECT id, version_number, content_hash, note, created_at
      FROM vault_script_versions
      WHERE script_id = ${script.id}
      ORDER BY version_number DESC
      LIMIT 100
    `;
    return res.status(200).json({ versions, currentVersion: script.current_version || 1 });
  } catch (err) {
    console.error('List versions error:', err);
    return res.status(500).json({ error: 'Failed to load versions' });
  }
}
