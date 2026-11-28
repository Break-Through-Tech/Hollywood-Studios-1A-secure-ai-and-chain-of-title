import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultAttachmentsTable } from '../_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { id, ownerEmail } = req.body;

  if (!id || !ownerEmail) {
    return res.status(400).json({ error: 'id and ownerEmail are required' });
  }

  try {
    await ensureVaultAttachmentsTable(sql);

    const [att] = await sql`SELECT blob_url FROM vault_attachments WHERE id = ${id} AND owner_email = ${ownerEmail}`;
    if (!att) return res.status(403).json({ error: 'Not authorized or not found' });

    if (att.blob_url) await del(att.blob_url).catch(() => {});

    await sql`DELETE FROM vault_attachments WHERE id = ${id} AND owner_email = ${ownerEmail}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Attachment delete error:', err);
    return res.status(500).json({ error: 'Failed to delete attachment' });
  }
}
