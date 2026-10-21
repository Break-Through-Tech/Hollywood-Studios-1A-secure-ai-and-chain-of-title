import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveVaultAccess, readScriptContent } from './_access.js';
import { ensureVaultTimestampsTable } from './_schema.js';

const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submitToCalendar(hashHex: string): Promise<{ proof: string; calendar: string } | null> {
  const hashBytes = new Uint8Array(hashHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));

  for (const calendar of OTS_CALENDARS) {
    try {
      const res = await fetch(`${calendar}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: hashBytes,
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const proof = Buffer.from(buf).toString('base64');
        return { proof, calendar };
      }
    } catch { /* try next calendar */ }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultTimestampsTable(sql);
  const { slug, ownerEmail } = req.body;

  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can timestamp' });
    }

    const content = await readScriptContent(access.item);
    if (!content.trim()) {
      return res.status(400).json({ error: 'No content to timestamp' });
    }

    const contentHash = await sha256Hex(content);

    const existing = await sql`
      SELECT id FROM vault_timestamps
      WHERE vault_slug = ${slug} AND content_hash = ${contentHash}
        AND status IN ('pending', 'confirmed')`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This exact content is already timestamped' });
    }

    const result = await submitToCalendar(contentHash);
    if (!result) {
      const [row] = await sql`
        INSERT INTO vault_timestamps (vault_slug, owner_email, content_hash, status, error_message)
        VALUES (${slug}, ${ownerEmail}, ${contentHash}, 'failed', 'All calendar servers unreachable')
        RETURNING *`;
      return res.status(502).json({ timestamp: row, error: 'Calendar servers unreachable. Try again later.' });
    }

    const [row] = await sql`
      INSERT INTO vault_timestamps (vault_slug, owner_email, content_hash, ots_proof, status)
      VALUES (${slug}, ${ownerEmail}, ${contentHash}, ${result.proof}, 'pending')
      RETURNING *`;

    return res.status(201).json({ timestamp: row });
  } catch (err) {
    console.error('Timestamp error:', err);
    return res.status(500).json({ error: 'Failed to create timestamp' });
  }
}
