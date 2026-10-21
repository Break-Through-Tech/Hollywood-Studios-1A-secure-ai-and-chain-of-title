import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = req.query.email as string | undefined;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const conversations = await sql`
      SELECT c.*,
        CASE WHEN c.participant_a = ${email} THEN c.participant_b ELSE c.participant_a END AS other_email,
        p.display_name AS other_display_name,
        p.handle AS other_handle,
        p.avatar_url AS other_avatar_url,
        m.content AS last_message_content,
        m.sender_email AS last_message_sender,
        EXISTS(
          SELECT 1 FROM connections cn
          JOIN profiles pa ON pa.email = c.participant_a
          JOIN profiles pb ON pb.email = c.participant_b
          WHERE ((cn.from_profile = pa.id AND cn.to_profile = pb.id)
              OR (cn.from_profile = pb.id AND cn.to_profile = pa.id))
            AND cn.status = 'accepted'
        ) AS is_friend
      FROM conversations c
      LEFT JOIN profiles p ON p.email = CASE WHEN c.participant_a = ${email} THEN c.participant_b ELSE c.participant_a END
      LEFT JOIN LATERAL (
        SELECT content, sender_email, attachment_name FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) m ON TRUE
      WHERE c.participant_a = ${email} OR c.participant_b = ${email}
      ORDER BY c.last_message_at DESC
    `;

    return res.status(200).json({ conversations });
  } catch (err) {
    console.error('Conversations list error:', err);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
}
