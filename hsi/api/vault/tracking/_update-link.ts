import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';
import { hashPasscode, LINK_SELECT_FIELDS, sanitizeEmails } from './_gates.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { linkId, ownerEmail, isActive, requireEmail, label, expiresAt, maxVisits, passcode,
          allowedEmails, allowDownload, notifyOnView, ndaText, watermarkEnabled, verifyEmail } = req.body;
  if (!linkId || !ownerEmail) return res.status(400).json({ error: 'linkId and ownerEmail are required' });

  try {
    await ensureVaultTrackingTables(sql);
    const [existing] = await sql`
      SELECT id, label, require_email, is_active, expires_at, max_visits, passcode_hash,
             allowed_emails, allow_download, notify_on_view, nda_text, watermark_enabled, verify_email
      FROM vault_share_links WHERE id = ${linkId} AND owner_email = ${ownerEmail}
    `;
    if (!existing) return res.status(403).json({ error: 'Not authorized' });

    const nextActive = typeof isActive === 'boolean' ? isActive : existing.is_active;
    const nextRequire = typeof requireEmail === 'boolean' ? requireEmail : existing.require_email;
    const nextLabel = typeof label === 'string' ? label : existing.label;
    const nextDownload = typeof allowDownload === 'boolean' ? allowDownload : existing.allow_download;
    const nextNotify = typeof notifyOnView === 'boolean' ? notifyOnView : existing.notify_on_view;
    const nextWatermark = typeof watermarkEnabled === 'boolean' ? watermarkEnabled : existing.watermark_enabled;
    const nextVerify = typeof verifyEmail === 'boolean' ? verifyEmail : existing.verify_email;
    const nextEmails = allowedEmails !== undefined ? sanitizeEmails(allowedEmails) : existing.allowed_emails;

    let nextExpiry = existing.expires_at;
    if (expiresAt !== undefined) {
      if (!expiresAt) {
        nextExpiry = null;
      } else {
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Invalid expiration date' });
        nextExpiry = parsed;
      }
    }

    let nextMaxVisits = existing.max_visits;
    if (maxVisits !== undefined) {
      nextMaxVisits = typeof maxVisits === 'number' && maxVisits > 0 ? Math.floor(maxVisits) : null;
    }

    // passcode: undefined = keep, '' = clear, non-empty string = set
    let nextPasscodeHash = existing.passcode_hash;
    if (passcode !== undefined) {
      nextPasscodeHash = typeof passcode === 'string' && passcode.trim() ? hashPasscode(passcode.trim()) : null;
    }

    let nextNda = existing.nda_text;
    if (ndaText !== undefined) {
      nextNda = typeof ndaText === 'string' && ndaText.trim() ? ndaText.trim() : null;
    }

    const [link] = await sql`
      UPDATE vault_share_links
      SET is_active = ${nextActive}, require_email = ${nextRequire}, label = ${nextLabel},
          expires_at = ${nextExpiry}, max_visits = ${nextMaxVisits}, passcode_hash = ${nextPasscodeHash},
          allowed_emails = ${nextEmails}, allow_download = ${nextDownload},
          notify_on_view = ${nextNotify}, nda_text = ${nextNda}, watermark_enabled = ${nextWatermark},
          verify_email = ${nextVerify}
      WHERE id = ${linkId}
      RETURNING ${sql.unsafe(LINK_SELECT_FIELDS)}
    `;
    return res.status(200).json({ link });
  } catch (err) {
    console.error('Update share link error:', err);
    return res.status(500).json({ error: 'Failed to update link' });
  }
}
