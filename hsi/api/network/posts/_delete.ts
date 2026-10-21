import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, postId } = req.body;

  if (!email || !postId) return res.status(400).json({ error: 'email and postId are required' });

  try {
    const [profile] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
    if (!profile) return res.status(403).json({ error: 'Profile not found' });

    const [post] = await sql`SELECT * FROM posts WHERE id = ${postId}`;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.profile_id !== profile.id) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    const mediaItems = Array.isArray(post.media) ? post.media : [];
    const blobUrls = mediaItems.map((m: Record<string, string>) => m.url).filter(Boolean);
    if (blobUrls.length > 0) {
      await del(blobUrls).catch((err) => console.error('Blob cleanup error:', err));
    }

    await sql`DELETE FROM posts WHERE id = ${postId}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Post delete error:', err);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
}
