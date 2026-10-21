import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultFoldersTable } from './_schema.js';

function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, title, projectType, privacy, status, collaborators, folderSlug } = req.body;

  if (!ownerEmail || !title) {
    return res.status(400).json({ error: 'ownerEmail and title are required' });
  }

  try {
    await ensureVaultFoldersTable(sql);
    const slug = generateSlug();
    const [row] = await sql`
      INSERT INTO vault_scripts (slug, owner_email, title, item_kind, project_type, privacy, status, collaborators, folder_slug)
      VALUES (${slug}, ${ownerEmail}, ${title}, 'workspace',
              ${projectType || 'other'}, ${privacy || 'private'},
              ${status || 'draft'}, ${collaborators || []}, ${folderSlug || null})
      RETURNING slug, title, file_name, file_type, file_size, item_kind, project_type, privacy, status, collaborators, created_at
    `;
    return res.status(201).json(row);
  } catch (err) {
    console.error('Vault create-workspace error:', err);
    return res.status(500).json({ error: 'Failed to create workspace' });
  }
}
