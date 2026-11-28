import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, pageName, platform, pageUrl } = req.body;
  if (!email || !pageName || !platform) return res.status(400).json({ error: 'email, pageName, and platform are required' });

  try {
    const [page] = await sql`INSERT INTO user_pages (owner_email, page_name, platform, page_url)
      VALUES (${email}, ${pageName}, ${platform}, ${pageUrl || null}) RETURNING *`;
    return res.status(201).json(page);
  } catch (err) {
    console.error('Pages add error:', err);
    return res.status(500).json({ error: 'Failed to add page' });
  }
}
