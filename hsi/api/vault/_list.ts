import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTimestampsTable, ensureVaultEncryptionColumns, ensureVaultFoldersTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultTimestampsTable(sql);
  await ensureVaultEncryptionColumns(sql);
  await ensureVaultFoldersTable(sql);
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const owned = await sql`
      SELECT s.slug, s.title, s.file_name, s.file_type, s.file_size,
             s.item_kind, s.project_type, s.privacy, s.status, s.collaborators,
             s.folder_slug,
             COALESCE(s.is_encrypted, false) AS is_encrypted, s.created_at,
        COALESCE(
          (SELECT json_agg(json_build_object('shared_with', sh.shared_with, 'permission', sh.permission))
           FROM vault_shares sh WHERE sh.script_id = s.id), '[]'
        ) AS shares,
        EXISTS(
          SELECT 1 FROM vault_timestamps vt
          WHERE vt.vault_slug = s.slug AND vt.status = 'confirmed'
        ) AS has_timestamp
      FROM vault_scripts s
      WHERE s.owner_email = ${email}
      ORDER BY s.created_at DESC
    `;

    const shared = await sql`
      SELECT s.slug, s.title, s.file_name, s.file_type, s.file_size,
             s.item_kind, s.project_type, s.privacy, s.status, s.created_at,
             s.owner_email, sh.permission AS my_permission
      FROM vault_shares sh
      JOIN vault_scripts s ON s.id = sh.script_id
      WHERE LOWER(sh.shared_with) = LOWER(${email})
      ORDER BY s.created_at DESC
    `;

    const folders = await sql`
      SELECT f.slug, f.name, f.created_at,
        (SELECT COUNT(*)::int FROM vault_scripts s
         WHERE s.folder_slug = f.slug AND s.owner_email = f.owner_email) AS item_count
      FROM vault_folders f
      WHERE f.owner_email = ${email}
      ORDER BY f.name ASC
    `;

    return res.status(200).json({ owned, shared, folders });
  } catch (err) {
    console.error('Vault list error:', err);
    return res.status(500).json({ error: 'Failed to list scripts' });
  }
}
