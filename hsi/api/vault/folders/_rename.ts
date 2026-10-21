import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultFoldersTable } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, slug, name } = req.body;

  if (!ownerEmail || !slug || !name?.trim()) {
    return res.status(400).json({ error: 'ownerEmail, slug and name are required' });
  }

  try {
    await ensureVaultFoldersTable(sql);
    const [row] = await sql`
      UPDATE vault_folders SET name = ${name.trim()}
      WHERE slug = ${slug} AND owner_email = ${ownerEmail}
      RETURNING slug, name
    `;
    if (!row) return res.status(403).json({ error: 'Not authorized or not found' });
    return res.status(200).json(row);
  } catch (err) {
    console.error('Vault folder rename error:', err);
    return res.status(500).json({ error: 'Failed to rename folder' });
  }
}
