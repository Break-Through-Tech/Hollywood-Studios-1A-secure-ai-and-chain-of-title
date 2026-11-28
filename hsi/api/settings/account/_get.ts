import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureProfile, normalizeEmail } from '../../auth/_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = normalizeEmail(req.body?.email);

  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    await ensureProfile(sql, email);
    const profile = (await sql`SELECT * FROM profiles WHERE LOWER(email) = ${email}`)[0];
    const app = (await sql`SELECT first_name, last_name FROM applications WHERE LOWER(email) = ${email}`)[0];
    let settings = (await sql`SELECT * FROM user_settings WHERE email = ${email}`)[0];
    if (!settings) {
      settings = (await sql`INSERT INTO user_settings (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING RETURNING *`)[0];
      if (!settings) settings = (await sql`SELECT * FROM user_settings WHERE email = ${email}`)[0];
    }

    let connectionCount = 0;
    if (profile) {
      const countRow = (await sql`
        SELECT COUNT(*)::int AS cnt FROM connections
        WHERE (from_profile = ${profile.id} OR to_profile = ${profile.id}) AND status = 'accepted'
      `)[0];
      connectionCount = countRow?.cnt || 0;
    }

    return res.status(200).json({ profile: profile || null, application: app || null, settings, connectionCount });
  } catch (err) {
    console.error('Settings account get error:', err);
    return res.status(500).json({ error: 'Failed to load account' });
  }
}
