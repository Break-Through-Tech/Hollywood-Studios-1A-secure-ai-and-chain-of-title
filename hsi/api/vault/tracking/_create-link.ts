import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables, generateToken } from '../_schema.js';
import { hashPasscode, LINK_SELECT_FIELDS, sanitizeEmails } from './_gates.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, label, requireEmail, expiresAt, maxVisits, passcode,
          allowedEmails, allowDownload, notifyOnView, ndaText, watermarkEnabled, verifyEmail } = req.body;
  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const [script] = await sql`SELECT id, is_encrypted FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });
    if (script.is_encrypted) {
      return res.status(400).json({ error: 'Trackable links are not available for encrypted projects' });
    }

    await ensureVaultTrackingTables(sql);
    const token = generateToken();
    const expiry = typeof expiresAt === 'string' && expiresAt ? new Date(expiresAt) : null;
    if (expiry && Number.isNaN(expiry.getTime())) return res.status(400).json({ error: 'Invalid expiration date' });
    const visits = typeof maxVisits === 'number' && maxVisits > 0 ? Math.floor(maxVisits) : null;
    const passcodeHash = typeof passcode === 'string' && passcode.trim() ? hashPasscode(passcode.trim()) : null;
    const emails = sanitizeEmails(allowedEmails);

    const [link] = await sql`
      INSERT INTO vault_share_links
        (token, script_id, owner_email, label, require_email, expires_at, max_visits,
         passcode_hash, allowed_emails, allow_download, notify_on_view, nda_text, watermark_enabled, verify_email)
      VALUES (${token}, ${script.id}, ${ownerEmail}, ${label || null}, ${requireEmail !== false},
              ${expiry}, ${visits}, ${passcodeHash}, ${emails},
              ${allowDownload === true}, ${notifyOnView !== false},
              ${typeof ndaText === 'string' && ndaText.trim() ? ndaText.trim() : null},
              ${watermarkEnabled !== false}, ${verifyEmail === true})
      RETURNING ${sql.unsafe(LINK_SELECT_FIELDS)}
    `;
    return res.status(200).json({ link });
  } catch (err) {
    console.error('Create share link error:', err);
    return res.status(500).json({ error: 'Failed to create link' });
  }
}
