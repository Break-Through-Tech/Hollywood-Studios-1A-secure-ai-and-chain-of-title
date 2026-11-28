import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail, sharedWith } = req.body;

  if (!slug || !ownerEmail || !sharedWith) {
    return res.status(400).json({ error: 'slug, ownerEmail, and sharedWith are required' });
  }

  try {
    const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!script) return res.status(403).json({ error: 'Not authorized' });

    await sql`DELETE FROM vault_shares WHERE script_id = ${script.id} AND LOWER(shared_with) = ${String(sharedWith).trim().toLowerCase()}`;

    const remaining = await sql`SELECT id FROM vault_shares WHERE script_id = ${script.id} LIMIT 1`;
    if (remaining.length === 0) {
      await sql`UPDATE vault_scripts SET privacy = 'private' WHERE id = ${script.id}`;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Vault unshare error:', err);
    return res.status(500).json({ error: 'Failed to remove share' });
  }
}
