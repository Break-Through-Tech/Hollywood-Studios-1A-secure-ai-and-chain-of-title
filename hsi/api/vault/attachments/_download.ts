import { neon } from '@neondatabase/serverless';
import { get } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAttachmentsTable } from '../_schema.js';
import { resolveVaultAccess } from '../_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { id, email, slug } = req.body;

  if (!id || !email || !slug) {
    return res.status(400).json({ error: 'id, email, and slug are required' });
  }

  try {
    await ensureVaultAttachmentsTable(sql);

    const access = await resolveVaultAccess(sql, slug, email);
    if (!access || access.role === 'viewer') {
      return res.status(403).json({ error: 'Download permission required' });
    }

    const [att] = await sql`SELECT file_name, file_data, blob_url FROM vault_attachments WHERE id = ${id} AND vault_slug = ${slug}`;
    if (!att) return res.status(404).json({ error: 'Not found' });

    if (att.blob_url) {
      const result = await get(att.blob_url, { access: 'private' });
      if (!result || !result.stream) return res.status(404).json({ error: 'File not found' });
      const contentType = result.headers.get('content-type') || 'application/octet-stream';
      const contentLength = result.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${att.file_name || 'download'}"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const reader = result.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    }

    return res.status(200).json({ file_name: att.file_name, file_data: att.file_data });
  } catch (err) {
    console.error('Attachment download error:', err);
    return res.status(500).json({ error: 'Failed to download attachment' });
  }
}
