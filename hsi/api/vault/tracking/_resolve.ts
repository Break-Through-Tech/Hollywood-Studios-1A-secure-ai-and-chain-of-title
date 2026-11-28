import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';
import { checkLinkAvailability } from './_gates.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    await ensureVaultTrackingTables(sql);
    const [link] = await sql`
      SELECT l.id, l.require_email, l.is_active, l.owner_email,
             l.expires_at, l.max_visits, l.visit_count,
             l.passcode_hash, l.allowed_emails, l.nda_text, l.verify_email,
             s.title, s.project_type, s.is_encrypted
      FROM vault_share_links l
      JOIN vault_scripts s ON s.id = l.script_id
      WHERE l.token = ${token}
    `;
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const blocked = checkLinkAvailability(link);
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });

    return res.status(200).json({
      title: link.title,
      ownerEmail: link.owner_email,
      projectType: link.project_type,
      requireEmail: link.require_email,
      hasPasscode: !!link.passcode_hash,
      hasAllowlist: Array.isArray(link.allowed_emails) && link.allowed_emails.length > 0,
      ndaText: link.nda_text || null,
      verifyEmail: !!link.verify_email,
    });
  } catch (err) {
    console.error('Resolve share link error:', err);
    return res.status(500).json({ error: 'Failed to load shared document' });
  }
}
