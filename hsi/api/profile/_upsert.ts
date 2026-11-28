import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from '../auth/_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { handle, displayName, headline, bio, location, skills, representation, mediaLinks, avatarUrl, featuredCreditIds } = req.body;

  const email = normalizeEmail(req.body?.email);

  if (!email || !handle || !displayName) {
    return res.status(400).json({ error: 'email, handle, and displayName are required' });
  }

  try {
    const [profile] = await sql`
      INSERT INTO profiles (email, handle, display_name, headline, bio, location, avatar_url, skills, representation, media_links, featured_credit_ids, updated_at)
      VALUES (${email}, ${handle}, ${displayName}, ${headline || null}, ${bio || null}, ${location || null},
              ${avatarUrl || null}, ${JSON.stringify(skills || [])}, ${JSON.stringify(representation || [])}, ${JSON.stringify(mediaLinks || [])}, ${JSON.stringify(featuredCreditIds || [])}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        handle = ${handle},
        display_name = ${displayName},
        headline = ${headline || null},
        bio = ${bio || null},
        location = ${location || null},
        avatar_url = COALESCE(${avatarUrl}, profiles.avatar_url),
        skills = ${JSON.stringify(skills || [])},
        representation = ${JSON.stringify(representation || [])},
        media_links = ${JSON.stringify(mediaLinks || [])},
        featured_credit_ids = ${JSON.stringify(featuredCreditIds || [])},
        updated_at = NOW()
      RETURNING *
    `;
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('Profile upsert error:', err);
    return res.status(500).json({ error: 'Failed to save profile' });
  }
}
