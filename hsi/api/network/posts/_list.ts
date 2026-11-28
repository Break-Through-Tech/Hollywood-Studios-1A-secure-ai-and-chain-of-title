import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const PAGE_SIZE = 20;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const cursor = req.query.cursor as string | undefined;
  const email = req.query.email as string | undefined;

  try {
    let viewerProfileId: number | null = null;
    if (email) {
      const [viewer] = await sql`SELECT id FROM profiles WHERE email = ${email}`;
      if (viewer) viewerProfileId = viewer.id;
    }

    const posts = cursor
      ? await sql`
          SELECT p.*,
            pr.handle, pr.display_name, pr.avatar_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
            ${viewerProfileId
              ? sql`EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND profile_id = ${viewerProfileId})`
              : sql`FALSE`
            } AS liked_by_viewer,
            ${viewerProfileId
              ? sql`(p.profile_id = ${viewerProfileId})`
              : sql`FALSE`
            } AS is_owner
          FROM posts p
          JOIN profiles pr ON pr.id = p.profile_id
          WHERE p.created_at < ${cursor}
          ORDER BY p.created_at DESC
          LIMIT ${PAGE_SIZE}
        `
      : await sql`
          SELECT p.*,
            pr.handle, pr.display_name, pr.avatar_url,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS like_count,
            ${viewerProfileId
              ? sql`EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND profile_id = ${viewerProfileId})`
              : sql`FALSE`
            } AS liked_by_viewer,
            ${viewerProfileId
              ? sql`(p.profile_id = ${viewerProfileId})`
              : sql`FALSE`
            } AS is_owner
          FROM posts p
          JOIN profiles pr ON pr.id = p.profile_id
          ORDER BY p.created_at DESC
          LIMIT ${PAGE_SIZE}
        `;

    const nextCursor = posts.length === PAGE_SIZE ? posts[posts.length - 1].created_at : null;

    const topCreators = await sql`
      SELECT pr.handle, pr.display_name, pr.avatar_url, COUNT(p.id)::int AS post_count
      FROM posts p
      JOIN profiles pr ON pr.id = p.profile_id
      GROUP BY pr.id, pr.handle, pr.display_name, pr.avatar_url
      ORDER BY post_count DESC
      LIMIT 5
    `;

    const postActivity = await sql`
      SELECT
        FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 14400)::int AS bucket
      FROM posts
      WHERE created_at > NOW() - INTERVAL '48 hours'
    `;
    const buckets = Array.from({ length: 12 }, () => 0);
    for (const row of postActivity) {
      const b = row.bucket as number;
      if (b >= 0 && b < 12) buckets[b]++;
    }

    return res.status(200).json({ posts, nextCursor, topCreators, postActivity: buckets });
  } catch (err) {
    console.error('Post list error:', err);
    return res.status(500).json({ error: 'Failed to list posts' });
  }
}
