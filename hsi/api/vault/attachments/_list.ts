import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAttachmentsTable } from '../_schema.js';
import { resolveVaultAccess } from '../_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, email } = req.body;

  if (!slug || !email) {
    return res.status(400).json({ error: 'slug and email are required' });
  }

  try {
    await ensureVaultAttachmentsTable(sql);

    const access = await resolveVaultAccess(sql, slug, email);
    if (!access) return res.status(403).json({ error: 'Not authorized' });

    const rows = await sql`
      SELECT id, file_name, file_type, file_size, created_at
      FROM vault_attachments
      WHERE vault_slug = ${slug}
      ORDER BY created_at DESC`;

    return res.status(200).json(rows);
  } catch (err) {
    console.error('Attachment list error:', err);
    return res.status(500).json({ error: 'Failed to list attachments' });
  }
}
