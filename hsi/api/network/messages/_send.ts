import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureMessageAttachmentColumns } from '../../vault/_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMessageAttachmentColumns(sql);
  const { email, toEmail, content, attachmentName, attachmentType, attachmentSize, attachmentBlobUrl } = req.body;

  const hasText = content?.trim();
  const hasAttachment = attachmentBlobUrl && attachmentName;

  if (!email || !toEmail || (!hasText && !hasAttachment)) return res.status(400).json({ error: 'email, toEmail, and content or attachment are required' });
  if (email === toEmail) return res.status(400).json({ error: 'Cannot message yourself' });
  if (hasText && content.trim().length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });

  try {
    const [meProfile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    const [toProfile] = await sql`SELECT id FROM profiles WHERE email = ${toEmail}`;
    if (!meProfile || !toProfile) return res.status(403).json({ error: 'Profile not found' });

    const [connection] = await sql`
      SELECT id FROM connections
      WHERE ((from_profile = ${meProfile.id} AND to_profile = ${toProfile.id}) OR (from_profile = ${toProfile.id} AND to_profile = ${meProfile.id}))
        AND status = 'accepted'`;
    if (!connection) return res.status(403).json({ error: 'You can only message friends' });

    const [a, b] = [email, toEmail].sort();

    const [conv] = await sql`
      INSERT INTO conversations (participant_a, participant_b, last_message_at)
      VALUES (${a}, ${b}, NOW())
      ON CONFLICT (participant_a, participant_b) DO UPDATE SET last_message_at = NOW()
      RETURNING id`;

    const [message] = await sql`
      INSERT INTO messages (conversation_id, sender_email, content, attachment_name, attachment_type, attachment_size, attachment_blob_url)
      VALUES (${conv.id}, ${email}, ${hasText ? content.trim() : ''}, ${attachmentName || null}, ${attachmentType || null}, ${attachmentSize || null}, ${attachmentBlobUrl || null})
      RETURNING *`;

    return res.status(201).json({ message, conversationId: conv.id });
  } catch (err) {
    console.error('Message send error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
