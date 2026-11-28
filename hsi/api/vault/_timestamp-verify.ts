import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTimestampsTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultTimestampsTable(sql);
  const { contentHash } = req.body;

  if (!contentHash) return res.status(400).json({ error: 'contentHash is required' });

  try {
    const timestamps = await sql`
      SELECT content_hash, ots_proof, status, created_at, confirmed_at
      FROM vault_timestamps
      WHERE content_hash = ${contentHash}
      ORDER BY created_at DESC`;

    return res.status(200).json({
      found: timestamps.length > 0,
      timestamps,
    });
  } catch (err) {
    console.error('Timestamp verify error:', err);
    return res.status(500).json({ error: 'Failed to verify timestamp' });
  }
}
