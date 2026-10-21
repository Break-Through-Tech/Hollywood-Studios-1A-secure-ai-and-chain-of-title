import { neon } from '@neondatabase/serverless';
import { get } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveVaultAccess } from './_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, email } = req.body;

  if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });

  try {
    const access = await resolveVaultAccess(sql, slug, email);
    if (!access) return res.status(404).json({ error: 'Not found' });

    // Viewers may read the file inline (the page renders it); only downloaders
    // get it as an attachment they can keep.
    const { item, role } = access;
    const disposition = role === 'viewer' ? 'inline' : 'attachment';

    if (item.blob_url) {
      const result = await get(item.blob_url, { access: 'private' });
      if (!result || !result.stream) return res.status(404).json({ error: 'File not found' });
      const contentType = result.headers.get('content-type') || 'application/octet-stream';
      const contentLength = result.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${item.file_name || 'download'}"`);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const reader = result.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    }

    if (item.file_data) {
      return res.status(200).json({
        file_name: item.file_name,
        file_data: item.file_data,
        is_encrypted: item.is_encrypted || false,
      });
    }

    return res.status(404).json({ error: 'No file content available' });
  } catch (err) {
    console.error('Vault download error:', err);
    return res.status(500).json({ error: 'Failed to download file' });
  }
}
