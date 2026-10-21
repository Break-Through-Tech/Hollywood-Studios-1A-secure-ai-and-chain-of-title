import { neon } from '@neondatabase/serverless';
import { get } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { messageId, email } = req.body;

  if (!messageId || !email) {
    return res.status(400).json({ error: 'messageId and email are required' });
  }

  try {
    const [msg] = await sql`
      SELECT m.attachment_name, m.attachment_blob_url, c.participant_a, c.participant_b
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ${messageId}
        AND m.attachment_blob_url IS NOT NULL`;

    if (!msg) return res.status(404).json({ error: 'Attachment not found' });

    if (msg.participant_a !== email && msg.participant_b !== email) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const result = await get(msg.attachment_blob_url, { access: 'private' });
    if (!result || !result.stream) return res.status(404).json({ error: 'File not found' });
    const contentType = result.headers.get('content-type') || 'application/octet-stream';
    const contentLength = result.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${msg.attachment_name || 'download'}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    return res.end();
  } catch (err) {
    console.error('Attachment download error:', err);
    return res.status(500).json({ error: 'Failed to download attachment' });
  }
}
