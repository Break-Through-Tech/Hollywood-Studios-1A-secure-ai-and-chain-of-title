import { get } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).end('Missing url parameter');
  if (!url.includes('.private.blob.vercel-storage.com')) return res.status(400).end('Not a private blob URL');

  try {
    const result = await get(url, { access: 'private' });
    if (!result || !result.stream) return res.status(404).json({ error: 'File not found' });
    const contentType = result.headers.get('content-type') || 'application/octet-stream';
    const contentLength = result.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch {
    return res.status(404).end('Blob not found');
  }
}
