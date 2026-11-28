import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAnalysesTable } from '../_schema.js';
import { resolveVaultAccess } from '../_access.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, tool } = req.body;

  if (!slug || !ownerEmail || !tool) return res.status(400).json({ error: 'slug, ownerEmail, and tool are required' });

  try {
    const access = await resolveVaultAccess(sql, slug, ownerEmail);
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can reset analysis' });
    }

    await ensureVaultAnalysesTable(sql);

    await sql`DELETE FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${tool}`;

    const downstream: string[] = [];
    if (tool === 'coverage') downstream.push('relativity', 'greenlight');
    else if (tool === 'relativity') downstream.push('greenlight');
    for (const t of downstream) {
      await sql`DELETE FROM vault_analyses WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND tool = ${t}`;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Analysis reset error:', err);
    return res.status(500).json({ error: 'Failed to reset analysis' });
  }
}
