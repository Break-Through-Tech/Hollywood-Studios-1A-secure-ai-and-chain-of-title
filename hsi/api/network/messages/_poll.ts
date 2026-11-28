import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = req.query.email as string | undefined;
  const since = req.query.since as string | undefined;

  if (!email || !since) return res.status(400).json({ error: 'email and since are required' });

  try {
    const updates = await sql`
      SELECT m.id, m.conversation_id, m.sender_email, m.content, m.created_at,
        m.attachment_name, m.attachment_type, m.attachment_size, m.attachment_blob_url,
        p.display_name AS sender_display_name, p.avatar_url AS sender_avatar_url,
        (m.sender_email = ${email}) AS is_mine
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      LEFT JOIN profiles p ON p.email = m.sender_email
      WHERE (c.participant_a = ${email} OR c.participant_b = ${email})
        AND m.created_at > ${since}
      ORDER BY m.created_at ASC`;

    return res.status(200).json({ updates, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error('Message poll error:', err);
    return res.status(500).json({ error: 'Failed to poll messages' });
  }
}
