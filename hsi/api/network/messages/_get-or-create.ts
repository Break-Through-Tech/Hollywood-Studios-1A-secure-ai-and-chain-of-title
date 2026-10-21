import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, toEmail } = req.body;

  if (!email || !toEmail) return res.status(400).json({ error: 'email and toEmail are required' });
  if (email === toEmail) return res.status(400).json({ error: 'Cannot message yourself' });

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
      INSERT INTO conversations (participant_a, participant_b)
      VALUES (${a}, ${b})
      ON CONFLICT (participant_a, participant_b) DO UPDATE SET participant_a = conversations.participant_a
      RETURNING *`;

    const [profile] = await sql`SELECT display_name, handle, avatar_url FROM profiles WHERE email = ${toEmail}`;

    return res.status(200).json({
      conversation: {
        ...conv,
        other_email: toEmail,
        other_display_name: profile?.display_name || toEmail,
        other_handle: profile?.handle || null,
        other_avatar_url: profile?.avatar_url || null,
        is_friend: true,
      },
    });
  } catch (err) {
    console.error('Get-or-create conversation error:', err);
    return res.status(500).json({ error: 'Failed to get or create conversation' });
  }
}
