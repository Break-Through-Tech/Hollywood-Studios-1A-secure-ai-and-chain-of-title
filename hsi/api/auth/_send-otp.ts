import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBaseUrl } from '../_base-url.js';
import { APPLICATION_GATE_ENABLED } from './_gate.js';
import { normalizeEmail } from './_ensure-profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const email = normalizeEmail(req.body?.email);

  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    if (APPLICATION_GATE_ENABLED) {
      const rows = await sql`SELECT status FROM applications WHERE LOWER(email) = ${email}`;

      if (rows.length === 0) return res.status(200).json({ exists: false });
      if (rows[0].status !== 'approved') return res.status(200).json({ exists: true, status: rows[0].status });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await sql`DELETE FROM otp_codes WHERE LOWER(email) = ${email} AND used = FALSE`;
    await sql`INSERT INTO otp_codes (email, code, expires_at) VALUES (${email}, ${code}, NOW() + INTERVAL '5 minutes')`;

    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: 'HSI <noreply@hollywoodstudios.ai>',
      to: email,
      subject: 'Your HSI verification code',
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
          <img src="${getBaseUrl(req)}/hero-logo.png" alt="HSI" width="48" style="margin-bottom: 24px;" />
          <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">Your verification code</h2>
          <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">Enter this code to sign in to HSI:</p>
          <div style="background: #1a1a1a; border-radius: 8px; padding: 16px 24px; text-align: center; margin-bottom: 24px;">
            <span style="color: #fff; font-size: 32px; letter-spacing: 0.3em; font-weight: 700;">${code}</span>
          </div>
          <p style="color: rgba(255,255,255,0.4); font-size: 13px; margin: 0 0 8px;">This code expires in 5 minutes.</p>
          <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
}
