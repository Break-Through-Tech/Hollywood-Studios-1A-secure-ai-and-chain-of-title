import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as { sessionKey?: string };
  const { sessionKey } = body;
  if (!sessionKey) return res.status(400).json({ error: 'sessionKey is required' });

  try {
    await ensureVaultTrackingTables(sql);
    const [session] = await sql`
      UPDATE vault_view_sessions
      SET download_count = COALESCE(download_count, 0) + 1, last_active_at = NOW()
      WHERE session_key = ${sessionKey}
      RETURNING id
    `;
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Download event error:', err);
    return res.status(500).json({ error: 'Failed to record download' });
  }
}
