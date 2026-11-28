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
    const updated = await sql`
      UPDATE vault_share_links SET is_active = FALSE
      WHERE script_id = ${script.id} AND is_active = TRUE
      RETURNING id
    `;
    return res.status(200).json({ deactivated: updated.length });
  } catch (err) {
    console.error('Deactivate all links error:', err);
    return res.status(500).json({ error: 'Failed to deactivate links' });
  }
}
