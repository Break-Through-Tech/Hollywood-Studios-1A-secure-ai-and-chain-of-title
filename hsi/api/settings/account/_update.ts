import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeEmail } from '../../auth/_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { displayName, handle } = req.body;
  const email = normalizeEmail(req.body?.email);
  const newEmail = req.body?.newEmail === undefined ? undefined : normalizeEmail(req.body.newEmail);

  if (!email) return res.status(400).json({ error: 'email is required' });
  if (newEmail !== undefined && !newEmail) return res.status(400).json({ error: 'newEmail is invalid' });

  try {
    if (displayName !== undefined) {
      await sql`UPDATE profiles SET display_name = ${displayName}, updated_at = NOW() WHERE LOWER(email) = ${email}`;
    }
    if (handle !== undefined) {
      const existing = await sql`SELECT id FROM profiles WHERE handle = ${handle} AND LOWER(email) != ${email}`;
      if (existing.length > 0) return res.status(409).json({ error: 'Username already taken' });
      await sql`UPDATE profiles SET handle = ${handle}, updated_at = NOW() WHERE LOWER(email) = ${email}`;
    }
    if (newEmail !== undefined) {
      const existing = await sql`SELECT id FROM profiles WHERE LOWER(email) = ${newEmail}`;
      if (existing.length > 0) return res.status(409).json({ error: 'Email already in use' });
      await sql`UPDATE profiles SET email = ${newEmail}, updated_at = NOW() WHERE LOWER(email) = ${email}`;
      await sql`UPDATE applications SET email = ${newEmail} WHERE LOWER(email) = ${email}`;
      await sql`UPDATE user_settings SET email = ${newEmail}, updated_at = NOW() WHERE LOWER(email) = ${email}`;
    }

    const [profile] = await sql`SELECT * FROM profiles WHERE LOWER(email) = ${newEmail || email}`;
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('Settings account update error:', err);
    return res.status(500).json({ error: 'Failed to update account' });
  }
}
