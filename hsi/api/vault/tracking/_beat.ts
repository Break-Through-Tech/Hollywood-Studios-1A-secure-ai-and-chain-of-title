import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  let body = req.body;
  // sendBeacon posts as text/plain, so the body may arrive unparsed
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { sessionKey, durationSeconds, maxScrollPct, pagesViewed, totalPages, pageTimes } = body || {};
  if (!sessionKey) return res.status(400).json({ error: 'sessionKey is required' });

  const duration = Math.max(0, Math.min(86400, Math.round(Number(durationSeconds) || 0)));
  const scroll = Math.max(0, Math.min(100, Math.round(Number(maxScrollPct) || 0)));
  const pages = Math.max(0, Math.min(10000, Math.round(Number(pagesViewed) || 0)));
  const total = Math.max(0, Math.min(10000, Math.round(Number(totalPages) || 0)));
  const times = pageTimes && typeof pageTimes === 'object' ? pageTimes : {};

  try {
    await sql`
      UPDATE vault_view_sessions
      SET duration_seconds = GREATEST(duration_seconds, ${duration}),
          max_scroll_pct = GREATEST(max_scroll_pct, ${scroll}),
          pages_viewed = GREATEST(pages_viewed, ${pages}),
          total_pages = GREATEST(total_pages, ${total}),
          page_times = ${JSON.stringify(times)}::jsonb,
          last_active_at = NOW()
      WHERE session_key = ${sessionKey}
    `;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Tracking beat error:', err);
    return res.status(500).json({ error: 'Failed to record' });
  }
}
