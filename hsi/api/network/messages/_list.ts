import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const PAGE_SIZE = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = req.query.email as string | undefined;
  const conversationId = req.query.conversationId as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  if (!email || !conversationId) return res.status(400).json({ error: 'email and conversationId are required' });

  try {
    const [conv] = await sql`SELECT id FROM conversations WHERE id = ${conversationId} AND (participant_a = ${email} OR participant_b = ${email})`;
    if (!conv) return res.status(403).json({ error: 'Not a participant in this conversation' });

    const messages = cursor
      ? await sql`
          SELECT m.id, m.conversation_id, m.sender_email, m.content, m.created_at,
            m.attachment_name, m.attachment_type, m.attachment_size, m.attachment_blob_url,
            p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url,
            (m.sender_email = ${email}) AS is_mine
          FROM messages m
          LEFT JOIN profiles p ON p.email = m.sender_email
          WHERE m.conversation_id = ${conversationId} AND m.created_at < ${cursor}
          ORDER BY m.created_at DESC LIMIT ${PAGE_SIZE}`
      : await sql`
          SELECT m.id, m.conversation_id, m.sender_email, m.content, m.created_at,
            m.attachment_name, m.attachment_type, m.attachment_size, m.attachment_blob_url,
            p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url,
            (m.sender_email = ${email}) AS is_mine
          FROM messages m
          LEFT JOIN profiles p ON p.email = m.sender_email
          WHERE m.conversation_id = ${conversationId}
          ORDER BY m.created_at DESC LIMIT ${PAGE_SIZE}`;

    const nextCursor = messages.length === PAGE_SIZE ? messages[messages.length - 1].created_at : null;

    return res.status(200).json({ messages, nextCursor });
  } catch (err) {
    console.error('Messages list error:', err);
    return res.status(500).json({ error: 'Failed to list messages' });
  }
}
