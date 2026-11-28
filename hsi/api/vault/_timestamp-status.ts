import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveVaultAccess } from './_access.js';
import { ensureVaultTimestampsTable } from './_schema.js';

const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

async function tryUpgrade(contentHash: string, currentProof: string): Promise<{ upgraded: boolean; proof: string }> {
  for (const calendar of OTS_CALENDARS) {
    try {
      const res = await fetch(`${calendar}/timestamp/${contentHash}`, { method: 'GET' });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const newProof = Buffer.from(buf).toString('base64');
        if (newProof !== currentProof && newProof.length > currentProof.length) {
          return { upgraded: true, proof: newProof };
        }
      }
    } catch { /* try next */ }
  }
  return { upgraded: false, proof: currentProof };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultTimestampsTable(sql);
  const { slug, ownerEmail } = req.body;

  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const timestamps = await sql`
      SELECT * FROM vault_timestamps
      WHERE vault_slug = ${slug}
      ORDER BY created_at DESC LIMIT 10`;

    for (const ts of timestamps) {
      if (ts.status === 'pending' && ts.ots_proof) {
        const result = await tryUpgrade(ts.content_hash, ts.ots_proof);
        if (result.upgraded) {
          await sql`
            UPDATE vault_timestamps
            SET ots_proof = ${result.proof}, status = 'confirmed', confirmed_at = NOW()
            WHERE id = ${ts.id}`;
          ts.status = 'confirmed';
          ts.ots_proof = result.proof;
          ts.confirmed_at = new Date().toISOString();
        }
      }
    }

    return res.status(200).json({ timestamps });
  } catch (err) {
    console.error('Timestamp status error:', err);
    return res.status(500).json({ error: 'Failed to check timestamp status' });
  }
}
