import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['pdf', 'docx', 'png', 'jpg', 'jpeg']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, toEmail, fileName, fileData } = req.body;

  if (!email || !toEmail || !fileName || !fileData) {
    return res.status(400).json({ error: 'email, toEmail, fileName, and fileData are required' });
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_TYPES.has(ext)) {
    return res.status(400).json({ error: 'File type not allowed. Accepted: PDF, DOCX, PNG, JPG, JPEG' });
  }

  try {
    const [meProfile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    const [toProfile] = await sql`SELECT id FROM profiles WHERE email = ${toEmail}`;
    if (!meProfile || !toProfile) return res.status(403).json({ error: 'Profile not found' });

    const [connection] = await sql`
      SELECT id FROM connections
      WHERE ((from_profile = ${meProfile.id} AND to_profile = ${toProfile.id}) OR (from_profile = ${toProfile.id} AND to_profile = ${meProfile.id}))
        AND status = 'accepted'`;
    if (!connection) return res.status(403).json({ error: 'You can only share files with friends' });

    const match = (fileData as string).match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid file data format' });

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_SIZE) {
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }

    const blob = await put(`messages/${email}/${Date.now()}-${fileName}`, buffer, {
      access: 'private',
      contentType: match[1],
    });

    return res.status(200).json({
      blobUrl: blob.url,
      fileName,
      fileType: ext,
      fileSize: buffer.length,
    });
  } catch (err) {
    console.error('Message attachment upload error:', err);
    return res.status(500).json({ error: 'Failed to upload attachment' });
  }
}
