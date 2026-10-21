import { randomInt } from 'crypto';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';
import { escapeHtml, hashViewerCode } from './_gates.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_WINDOW = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { token, email } = req.body as { token?: string; email?: string };
  if (!token) return res.status(400).json({ error: 'token is required' });
  const viewerEmail = (email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(viewerEmail)) return res.status(400).json({ error: 'A valid email is required' });

  try {
    await ensureVaultTrackingTables(sql);
    const [link] = await sql`
      SELECT l.id, l.is_active, l.verify_email, s.title
      FROM vault_share_links l
      JOIN vault_scripts s ON s.id = l.script_id
      WHERE l.token = ${token}
    `;
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (!link.is_active) return res.status(410).json({ error: 'This link has been deactivated' });
    if (!link.verify_email) return res.status(400).json({ error: 'This link does not require email verification' });

    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM vault_viewer_otps
      WHERE link_id = ${link.id} AND email = ${viewerEmail}
        AND created_at > NOW() - make_interval(mins => ${CODE_TTL_MINUTES})
    ` as { count: number }[];
    if (count >= MAX_CODES_PER_WINDOW) {
      return res.status(429).json({ error: 'Too many codes requested. Try again in a few minutes.' });
    }

    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    await sql`
      INSERT INTO vault_viewer_otps (link_id, email, code_hash, expires_at)
      VALUES (${link.id}, ${viewerEmail}, ${hashViewerCode(code)}, NOW() + make_interval(mins => ${CODE_TTL_MINUTES}))
    `;

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HSI Vault <noreply@hollywoodstudios.ai>',
        to: viewerEmail,
        subject: `Your verification code: ${code}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
            <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">Verify your email</h2>
            <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
              Use this code to view <strong style="color: #fff;">"${escapeHtml(String(link.title || 'the document'))}"</strong>. It expires in ${CODE_TTL_MINUTES} minutes.
            </p>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #fff; background: rgba(255,255,255,0.06); padding: 16px 24px; border-radius: 8px; text-align: center;">${code}</div>
            <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
          </div>
        `,
      });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('Verify viewer error:', err);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
}
