import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, postId } = req.body;

  if (!email || !postId) return res.status(400).json({ error: 'email and postId are required' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    const [post] = await sql`SELECT id FROM posts WHERE id = ${postId}`;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const [existing] = await sql`
      SELECT id FROM post_likes WHERE post_id = ${postId} AND profile_id = ${profile.id}
    `;

    if (existing) {
      await sql`DELETE FROM post_likes WHERE id = ${existing.id}`;
    } else {
      await sql`INSERT INTO post_likes (post_id, profile_id) VALUES (${postId}, ${profile.id})`;
    }

    const [{ count }] = await sql`SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ${postId}`;

    return res.status(200).json({ liked: !existing, likeCount: parseInt(count, 10) });
  } catch (err) {
    console.error('Post like error:', err);
    return res.status(500).json({ error: 'Failed to toggle like' });
  }
}
