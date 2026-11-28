import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readScriptContent } from '../_access.js';
import { ensureBlobColumns, ensureVaultTrackingTables, generateToken } from '../_schema.js';
import {
  checkLinkAvailability, emailAllowed, escapeHtml, extractGeo, extractIp,
  hashAgreement, hashViewerCode, verifyPasscode,
} from './_gates.js';
import { matchesSession } from '../../_session.js';
import { getBaseUrl } from '../../_base-url.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIFY_THROTTLE_MINUTES = 30;
const MAX_PASSCODE_FAILS = 5;
const LOCKOUT_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { token, email, name, passcode, signatureName, code } = req.body as {
    token?: string; email?: string; name?: string; passcode?: string; signatureName?: string; code?: string;
  };
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    await ensureVaultTrackingTables(sql);
    await ensureBlobColumns(sql);
    const [link] = await sql`
      SELECT l.id, l.script_id, l.require_email, l.is_active, l.owner_email, l.label,
             l.expires_at, l.max_visits, l.visit_count, l.passcode_hash, l.allowed_emails,
             l.allow_download, l.notify_on_view, l.nda_text, l.watermark_enabled,
             l.verify_email, l.failed_attempts, l.locked_until,
             s.title, s.slug, s.project_type, s.is_encrypted, s.current_version,
             s.blob_url, s.file_data, s.workspace_content
      FROM vault_share_links l
      JOIN vault_scripts s ON s.id = l.script_id
      WHERE l.token = ${token}
    `;
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const blocked = checkLinkAvailability(link);
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });

    const viewerEmail = (email || '').trim().toLowerCase();
    const allowlist: string[] = Array.isArray(link.allowed_emails) ? link.allowed_emails : [];

    if (link.passcode_hash) {
      if (link.locked_until && new Date(link.locked_until).getTime() > Date.now()) {
        return res.status(429).json({ error: 'Too many incorrect attempts. Try again later.' });
      }
      if (!passcode) return res.status(401).json({ error: 'Passcode required' });
      if (!verifyPasscode(passcode, link.passcode_hash)) {
        const fails = (link.failed_attempts || 0) + 1;
        if (fails >= MAX_PASSCODE_FAILS) {
          await sql`
            UPDATE vault_share_links
            SET failed_attempts = 0, locked_until = NOW() + make_interval(mins => ${LOCKOUT_MINUTES})
            WHERE id = ${link.id}
          `;
          return res.status(429).json({ error: 'Too many incorrect attempts. Try again later.' });
        }
        await sql`UPDATE vault_share_links SET failed_attempts = ${fails} WHERE id = ${link.id}`;
        return res.status(401).json({ error: 'Incorrect passcode' });
      }
      if (link.failed_attempts || link.locked_until) {
        await sql`UPDATE vault_share_links SET failed_attempts = 0, locked_until = NULL WHERE id = ${link.id}`;
      }
    }

    if (link.require_email || allowlist.length > 0) {
      if (!EMAIL_RE.test(viewerEmail)) return res.status(400).json({ error: 'A valid email is required' });
      if (!emailAllowed(viewerEmail, allowlist)) {
        return res.status(403).json({ error: 'This email is not authorized to view this document' });
      }
    }

    // only honor owner preview when the request carries a valid session for the owner —
    // otherwise a viewer typing the (visible) owner email gets uncounted, unlogged access
    const isOwnerPreview = !!viewerEmail
      && viewerEmail === String(link.owner_email).toLowerCase()
      && await matchesSession(sql, req, viewerEmail);

    if (link.verify_email && !isOwnerPreview) {
      if (!EMAIL_RE.test(viewerEmail)) return res.status(400).json({ error: 'A valid email is required' });
      const [alreadyVerified] = await sql`
        SELECT id FROM vault_viewer_otps
        WHERE link_id = ${link.id} AND email = ${viewerEmail} AND verified = TRUE
          AND created_at > NOW() - interval '24 hours'
        ORDER BY created_at DESC LIMIT 1
      `;
      if (!alreadyVerified) {
        const trimmedCode = (code || '').trim();
        if (!trimmedCode) {
          return res.status(401).json({ error: 'Email verification required', verificationRequired: true });
        }
        const [otp] = await sql`
          SELECT id, code_hash, attempts FROM vault_viewer_otps
          WHERE link_id = ${link.id} AND email = ${viewerEmail} AND verified = FALSE
            AND expires_at > NOW()
          ORDER BY created_at DESC LIMIT 1
        `;
        if (!otp) {
          return res.status(401).json({ error: 'Code expired. Request a new one.', verificationRequired: true });
        }
        if ((otp.attempts || 0) >= MAX_CODE_ATTEMPTS) {
          return res.status(429).json({ error: 'Too many attempts. Request a new code.', verificationRequired: true });
        }
        if (hashViewerCode(trimmedCode) !== otp.code_hash) {
          await sql`UPDATE vault_viewer_otps SET attempts = COALESCE(attempts, 0) + 1 WHERE id = ${otp.id}`;
          return res.status(401).json({ error: 'Incorrect code', verificationRequired: true });
        }
        await sql`UPDATE vault_viewer_otps SET verified = TRUE WHERE id = ${otp.id}`;
      }
    }

    const trimmedSignature = (signatureName || '').trim();
    if (link.nda_text && !trimmedSignature && !isOwnerPreview) {
      return res.status(400).json({ error: 'You must sign the agreement to view this document' });
    }

    const content = await readScriptContent({
      blob_url: link.blob_url,
      file_data: link.file_data,
      workspace_content: link.workspace_content,
    });

    const watermarkText = link.watermark_enabled
      ? `${viewerEmail || 'Confidential'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : null;

    // owner previewing their own link: serve content, record nothing
    if (isOwnerPreview) {
      return res.status(200).json({
        content, sessionKey: null,
        allowDownload: !!link.allow_download,
        watermarkText,
        title: link.title,
        ownerEmail: link.owner_email,
        projectType: link.project_type,
      });
    }

    // atomic increment guards against concurrent unlocks racing past the cap
    const [counted] = await sql`
      UPDATE vault_share_links
      SET visit_count = COALESCE(visit_count, 0) + 1
      WHERE id = ${link.id}
        AND (max_visits IS NULL OR max_visits <= 0 OR COALESCE(visit_count, 0) < max_visits)
      RETURNING id
    `;
    if (!counted) return res.status(410).json({ error: 'This link has reached its view limit' });

    const geo = extractGeo(req);
    const sessionKey = generateToken();
    const [session] = await sql`
      INSERT INTO vault_view_sessions
        (session_key, script_id, link_id, viewer_email, viewer_name, user_agent,
         ip_country, ip_city, ip_region, version_number)
      VALUES (${sessionKey}, ${link.script_id}, ${link.id}, ${viewerEmail || null}, ${(name || '').trim() || null},
              ${req.headers['user-agent'] || null}, ${geo.country}, ${geo.city}, ${geo.region},
              ${link.current_version || 1})
      RETURNING id
    `;

    if (link.nda_text) {
      await sql`
        INSERT INTO vault_link_signatures
          (link_id, script_id, session_id, signer_name, signer_email, ip_address, user_agent, agreement_hash)
        VALUES (${link.id}, ${link.script_id}, ${session.id}, ${trimmedSignature}, ${viewerEmail || null},
                ${extractIp(req)}, ${req.headers['user-agent'] || null}, ${hashAgreement(link.nda_text)})
      `;
    }

    if (link.notify_on_view && process.env.RESEND_API_KEY) {
      try {
        const [recent] = await sql`
          SELECT id FROM vault_view_sessions
          WHERE link_id = ${link.id}
            AND viewer_email IS NOT DISTINCT FROM ${viewerEmail || null}
            AND owner_notified = TRUE
            AND started_at > NOW() - make_interval(mins => ${NOTIFY_THROTTLE_MINUTES})
        `;
        if (!recent) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const who = escapeHtml(viewerEmail || 'Someone');
          const where = [geo.city, geo.country].filter(Boolean).join(', ');
          await resend.emails.send({
            from: 'HSI Vault <noreply@hollywoodstudios.ai>',
            to: link.owner_email,
            subject: `${viewerEmail || 'Someone'} is viewing "${link.title}"`,
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 40px 32px; border-radius: 12px;">
                <h2 style="color: #fff; font-size: 20px; margin: 0 0 8px;">Your document is being viewed</h2>
                <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px;">
                  <strong style="color: #fff;">${who}</strong> just opened <strong style="color: #fff;">"${escapeHtml(link.title)}"</strong>${link.label ? ` via your link "${escapeHtml(link.label)}"` : ''}${where ? ` from ${escapeHtml(where)}` : ''}.
                </p>
                <a href="${getBaseUrl(req)}/vault/script/${link.slug}" style="display: inline-block; padding: 10px 24px; background: #4f46e5; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                  See Live Analytics
                </a>
                <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin-top: 32px;">Hollywood Studios Intelligence</p>
              </div>
            `,
          });
          await sql`UPDATE vault_view_sessions SET owner_notified = TRUE WHERE id = ${session.id}`;
        }
      } catch (notifyErr) {
        console.error('View notification error:', notifyErr);
      }
    }

    return res.status(200).json({
      content,
      sessionKey,
      allowDownload: !!link.allow_download,
      watermarkText,
      title: link.title,
      ownerEmail: link.owner_email,
      projectType: link.project_type,
    });
  } catch (err) {
    console.error('Unlock share link error:', err);
    return res.status(500).json({ error: 'Failed to unlock document' });
  }
}
