import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, ownerEmail } = req.body;

  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const [item] = await sql`SELECT id, blob_url FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
    if (!item) return res.status(403).json({ error: 'Not authorized or not found' });

    const attachmentBlobs = await sql`SELECT blob_url FROM vault_attachments WHERE vault_slug = ${slug} AND owner_email = ${ownerEmail} AND blob_url IS NOT NULL`;

    const blobUrls = [
      ...(item.blob_url ? [item.blob_url as string] : []),
      ...attachmentBlobs.map(a => a.blob_url as string),
    ];
    if (blobUrls.length > 0) {
      await del(blobUrls).catch(() => {});
    }

    await sql`DELETE FROM vault_scripts WHERE id = ${item.id}`;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Vault delete error:', err);
    return res.status(500).json({ error: 'Failed to delete script' });
  }
}
