import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';
import { LINK_SELECT_FIELDS } from './_gates.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;
  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    await ensureVaultTrackingTables(sql);
    const links = await sql`
      SELECT ${sql.unsafe(LINK_SELECT_FIELDS)}
      FROM vault_share_links WHERE script_id = ${script.id}
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ links });
  } catch (err) {
    console.error('List share links error:', err);
    return res.status(500).json({ error: 'Failed to list links' });
  }
}
