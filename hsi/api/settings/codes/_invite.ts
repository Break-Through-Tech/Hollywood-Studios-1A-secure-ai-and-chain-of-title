import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBaseUrl } from '../../_base-url.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { email, invitedEmail } = req.body;
  if (!email || !invitedEmail) return res.status(400).json({ error: 'email and invitedEmail are required' });

  try {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const [row] = await sql`INSERT INTO access_codes (owner_email, code, invited_email) VALUES (${email}, ${code}, ${invitedEmail}) RETURNING *`;

    if (process.env.RESEND_API_KEY && invitedEmail.includes('@')) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HSI <noreply@hollywoodstudios.ai>',
        to: invitedEmail,
        subject: "You've been invited to HSI!",
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
            <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">You've been invited to HSI</h2>
            <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
              <strong style="color: #fff;">${email}</strong> invited you to join. Your invite code: <strong style="color: #fff;">${code}</strong>
            </p>
            <a href="${getBaseUrl(req)}/login" style="display: inline-block; margin-top: 16px; padding: 10px 24px; background: #293758; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Join HSI
            </a>
          </div>
        `,
      });
    }

    return res.status(201).json(row);
  } catch (err) {
    console.error('Invite error:', err);
    return res.status(500).json({ error: 'Failed to send invite' });
  }
}
