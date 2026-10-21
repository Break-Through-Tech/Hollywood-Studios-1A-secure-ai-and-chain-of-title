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
    const signatures = await sql`
      SELECT g.id, g.link_id, g.signer_name, g.signer_email, g.ip_address,
             g.agreement_hash, g.signed_at, l.label AS link_label
      FROM vault_link_signatures g
      LEFT JOIN vault_share_links l ON l.id = g.link_id
      WHERE g.script_id = ${script.id}
      ORDER BY g.signed_at DESC
      LIMIT 500
    `;
    return res.status(200).json({ signatures });
  } catch (err) {
    console.error('List signatures error:', err);
    return res.status(500).json({ error: 'Failed to load signatures' });
  }
}
