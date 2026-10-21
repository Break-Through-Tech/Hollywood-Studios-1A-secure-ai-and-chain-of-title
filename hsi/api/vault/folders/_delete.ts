import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultFoldersTable } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, slug } = req.body;

  if (!ownerEmail || !slug) {
    return res.status(400).json({ error: 'ownerEmail and slug are required' });
  }

  try {
    await ensureVaultFoldersTable(sql);
    const [folder] = await sql`
      SELECT id FROM vault_folders WHERE slug = ${slug} AND owner_email = ${ownerEmail}
    `;
    if (!folder) return res.status(403).json({ error: 'Not authorized or not found' });

    // Items inside the folder move back to the vault root, never deleted
    await sql`
      UPDATE vault_scripts SET folder_slug = NULL
      WHERE folder_slug = ${slug} AND owner_email = ${ownerEmail}
    `;
    await sql`DELETE FROM vault_folders WHERE id = ${folder.id}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Vault folder delete error:', err);
    return res.status(500).json({ error: 'Failed to delete folder' });
  }
}
