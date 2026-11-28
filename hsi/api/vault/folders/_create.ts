import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultFoldersTable, generateSlug } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, name } = req.body;

  if (!ownerEmail || !name?.trim()) {
    return res.status(400).json({ error: 'ownerEmail and name are required' });
  }

  try {
    await ensureVaultFoldersTable(sql);
    const slug = generateSlug();
    const [row] = await sql`
      INSERT INTO vault_folders (slug, owner_email, name)
      VALUES (${slug}, ${ownerEmail}, ${name.trim()})
      RETURNING slug, name, created_at
    `;
    return res.status(201).json(row);
  } catch (err) {
    console.error('Vault folder create error:', err);
    return res.status(500).json({ error: 'Failed to create folder' });
  }
}
