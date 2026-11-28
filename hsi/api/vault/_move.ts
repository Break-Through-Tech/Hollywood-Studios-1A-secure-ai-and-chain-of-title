import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultFoldersTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, slug, folderSlug } = req.body;

  if (!ownerEmail || !slug) {
    return res.status(400).json({ error: 'ownerEmail and slug are required' });
  }

  try {
    await ensureVaultFoldersTable(sql);

    const [item] = await sql`
      SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}
    `;
    if (!item) return res.status(403).json({ error: 'Not authorized or not found' });

    if (folderSlug) {
      const [folder] = await sql`
        SELECT id FROM vault_folders WHERE slug = ${folderSlug} AND owner_email = ${ownerEmail}
      `;
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
    }

    await sql`
      UPDATE vault_scripts SET folder_slug = ${folderSlug || null} WHERE id = ${item.id}
    `;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Vault move error:', err);
    return res.status(500).json({ error: 'Failed to move item' });
  }
}
