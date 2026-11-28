import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAttachmentsTable } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, fileName, fileData, fileSize } = req.body;

  if (!slug || !ownerEmail || !fileName || !fileData) {
    return res.status(400).json({ error: 'slug, ownerEmail, fileName, and fileData are required' });
  }

  try {
    await ensureVaultAttachmentsTable(sql);

    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    let blobUrl: string | null = null;

    const match = (fileData as string).match(/^data:(.+?);base64,(.+)$/);
    if (match) {
      const buffer = Buffer.from(match[2], 'base64');
      const blob = await put(`vault/${slug}/attachments/${fileName}`, buffer, {
        access: 'private',
        contentType: match[1],
      });
      blobUrl = blob.url;
    }

    const [att] = await sql`
      INSERT INTO vault_attachments (vault_slug, owner_email, file_name, file_type, file_size, blob_url)
      VALUES (${slug}, ${ownerEmail}, ${fileName}, ${ext}, ${fileSize || 0}, ${blobUrl})
      RETURNING id, file_name, file_type, file_size, created_at`;

    return res.status(200).json(att);
  } catch (err) {
    console.error('Attachment upload error:', err);
    return res.status(500).json({ error: 'Failed to upload attachment' });
  }
}
