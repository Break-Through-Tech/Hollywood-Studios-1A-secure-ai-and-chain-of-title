import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAnalysesTable } from '../_schema.js';
import { resolveVaultAccess } from '../_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;

  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    await ensureVaultAnalysesTable(sql);

    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access) return res.status(403).json({ error: 'Not authorized' });

    const itemOwner = access.item.owner_email;

    const rows = await sql`SELECT tool, status, overall_score, dimensions, error_message, started_at, completed_at, script_breakdown, act_analyses, detected_genre FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${itemOwner}`;

    const result: Record<string, Record<string, unknown> | null> = { coverage: null, relativity: null, greenlight: null };
    for (const row of rows) {
      result[row.tool] = {
        tool: row.tool,
        status: row.status,
        overall_score: row.overall_score,
        dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
        error_message: row.error_message,
        started_at: row.started_at,
        completed_at: row.completed_at,
        detected_genre: row.detected_genre || null,
        script_breakdown: row.script_breakdown ? true : null,
        act_analyses: row.act_analyses ? true : null,
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Analysis status error:', err);
    return res.status(500).json({ error: 'Failed to load analysis status' });
  }
}
