import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSession } from '../_session.js';
import { ensureProfile, normalizeEmail } from './_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

  try {
    const backup = process.env.OTP_BACKUP_CODE;
    if (backup && code === backup) {
      await ensureProfile(sql, email);
      const sessionToken = await createSession(sql, email);
      return res.status(200).json({ valid: true, sessionToken });
    }

    const rows = await sql`
      SELECT id FROM otp_codes
      WHERE LOWER(email) = ${email} AND code = ${code} AND used = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1
    `;

    if (rows.length === 0) return res.status(401).json({ valid: false, error: 'Invalid or expired code' });

    await sql`UPDATE otp_codes SET used = TRUE WHERE id = ${rows[0].id}`;
    await ensureProfile(sql, email);
    const sessionToken = await createSession(sql, email);

    return res.status(200).json({ valid: true, sessionToken });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Failed to verify code' });
  }
}
