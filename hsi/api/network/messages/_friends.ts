import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = req.query.email as string | undefined;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const [me] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!me) return res.status(403).json({ error: 'Profile not found' });

    const friends = await sql`
      SELECT p.email, p.display_name, p.handle, p.avatar_url
      FROM connections c
      JOIN profiles p ON p.id = CASE WHEN c.from_profile = ${me.id} THEN c.to_profile ELSE c.from_profile END
      WHERE (c.from_profile = ${me.id} OR c.to_profile = ${me.id}) AND c.status = 'accepted'
      ORDER BY p.display_name`;

    return res.status(200).json({ friends });
  } catch (err) {
    console.error('Message friends list error:', err);
    return res.status(500).json({ error: 'Failed to list friends' });
  }
}
