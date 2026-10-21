import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, email } = req.body;

  if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });

  try {
    const rows = await sql`
      SELECT s.title, s.item_kind, s.project_type, s.file_type, s.owner_email,
             p.display_name AS owner_display_name, p.handle AS owner_handle,
             sh.permission AS share_permission
      FROM vault_scripts s
      LEFT JOIN profiles p ON p.email = s.owner_email
      LEFT JOIN vault_shares sh ON sh.script_id = s.id AND LOWER(sh.shared_with) = LOWER(${email})
      WHERE s.slug = ${slug}
    `;

    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });

    const row = rows[0];
    const isOwner = row.owner_email === email;
    const hasAccess = isOwner || !!row.share_permission;

    if (!hasAccess) return res.status(403).json({ error: 'access_denied' });

    return res.status(200).json({
      title: row.title,
      item_kind: row.item_kind,
      project_type: row.project_type,
      file_type: row.file_type,
      owner_display_name: row.owner_display_name,
      owner_handle: row.owner_handle,
    });
  } catch (err) {
    console.error('Vault preview error:', err);
    return res.status(500).json({ error: 'Failed to load preview' });
  }
}
