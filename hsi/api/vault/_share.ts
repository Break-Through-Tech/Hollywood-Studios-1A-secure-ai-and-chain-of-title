import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBaseUrl } from '../_base-url.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, sharedWith, permission, encryptedDekForRecipient } = req.body;

  if (!slug || !ownerEmail || !sharedWith) {
    return res.status(400).json({ error: 'slug, ownerEmail, and sharedWith are required' });
  }

  // normalize so shares always match session emails, which are lowercased at login
  const recipient = String(sharedWith).trim().toLowerCase();

  try {
    const [script] = await sql`SELECT id, title, slug, item_kind FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    const perm = permission || 'view';
    const existing = await sql`SELECT id FROM vault_shares WHERE script_id = ${script.id} AND LOWER(shared_with) = ${recipient}`;
    if (existing.length > 0) {
      await sql`UPDATE vault_shares SET permission = ${perm} WHERE script_id = ${script.id} AND LOWER(shared_with) = ${recipient}`;
    } else {
      await sql`INSERT INTO vault_shares (script_id, shared_with, permission) VALUES (${script.id}, ${recipient}, ${perm})`;
    }

    await sql`UPDATE vault_scripts SET privacy = 'shared' WHERE id = ${script.id} AND privacy = 'private'`;

    if (encryptedDekForRecipient) {
      await sql`
        INSERT INTO vault_share_keys (script_id, shared_with, encrypted_dek)
        VALUES (${script.id}, ${recipient}, ${encryptedDekForRecipient})
        ON CONFLICT (script_id, shared_with) DO UPDATE SET encrypted_dek = ${encryptedDekForRecipient}
      `;
    }

    if (process.env.RESEND_API_KEY && recipient.includes('@')) {
      const baseUrl = getBaseUrl(req);
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HSI Vault <noreply@hollywoodstudios.ai>',
        to: recipient,
        subject: `A script has been shared with you — "${script.title}"`,
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
            <img src="${baseUrl}/hero-logo.png" alt="HSI" width="48" style="margin-bottom: 24px;" />
            <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">A script has been shared with you</h2>
            <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
              <strong style="color: #fff;">${ownerEmail}</strong> shared <strong style="color: #fff;">"${script.title}"</strong> with you (${perm} access).
            </p>
            <a href="${baseUrl}/vault/${script.item_kind === 'workspace' ? 'workspace' : 'script'}/${script.slug}" style="display: inline-block; padding: 10px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
              Open Project
            </a>
            <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
          </div>
        `,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Vault share error:', err);
    return res.status(500).json({ error: 'Failed to share script' });
  }
}
