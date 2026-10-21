import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultTrackingTables } from '../_schema.js';
import { matchesSession } from '../../_session.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { sessionKey, slug, ownerEmail, targetEmail, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
  if (content.length > 5000) return res.status(400).json({ error: 'Note is too long' });

  try {
    await ensureVaultTrackingTables(sql);

    if (sessionKey) {
      // viewer note tied to an active view session
      const [session] = await sql`
        SELECT id, script_id, viewer_email FROM vault_view_sessions WHERE session_key = ${sessionKey}
      `;
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const [note] = await sql`
        INSERT INTO vault_view_notes (script_id, session_id, author_email, kind, content)
        VALUES (${session.script_id}, ${session.id}, ${session.viewer_email || null}, 'viewer', ${content.trim()})
        RETURNING id, author_email, kind, content, created_at
      `;
      return res.status(200).json({ note });
    }

    if (slug && ownerEmail) {
      // owner private note about a viewer/share — this route is public for viewers, so re-check the session here
      if (!(await matchesSession(sql, req, ownerEmail))) {
        return res.status(401).json({ error: 'invalid_session' });
      }
      const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
      if (!script) return res.status(403).json({ error: 'Not authorized' });
      const [note] = await sql`
        INSERT INTO vault_view_notes (script_id, author_email, kind, target_email, content)
        VALUES (${script.id}, ${ownerEmail}, 'owner', ${targetEmail || null}, ${content.trim()})
        RETURNING id, author_email, kind, target_email, content, created_at
      `;
      return res.status(200).json({ note });
    }

    return res.status(400).json({ error: 'sessionKey or slug+ownerEmail required' });
  } catch (err) {
    console.error('Tracking note error:', err);
    return res.status(500).json({ error: 'Failed to save note' });
  }
}
