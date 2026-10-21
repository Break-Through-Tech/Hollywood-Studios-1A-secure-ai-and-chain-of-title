import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureVaultShareKeysTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultShareKeysTable(sql);

  if (req.method === 'GET') {
    const slug = req.query.slug as string;
    const email = req.query.email as string;
    if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });

    const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug}`;
    if (!script) return res.status(404).json({ error: 'Vault item not found' });

    const [shareKey] = await sql`
      SELECT encrypted_dek FROM vault_share_keys
      WHERE script_id = ${script.id} AND LOWER(shared_with) = LOWER(${email})
    `;
    if (!shareKey) return res.status(404).json({ error: 'No share key found' });
    return res.status(200).json({ encryptedDek: shareKey.encrypted_dek });
  }

  if (req.method === 'POST') {
    const { slug, ownerEmail, sharedWith, encryptedDek } = req.body;
    if (!slug || !ownerEmail || !sharedWith || !encryptedDek) {
      return res.status(400).json({ error: 'slug, ownerEmail, sharedWith, and encryptedDek are required' });
    }

    try {
      const [script] = await sql`SELECT id FROM vault_scripts WHERE slug = ${slug} AND owner_email = ${ownerEmail}`;
      if (!script) return res.status(403).json({ error: 'Not authorized' });

      await sql`
        INSERT INTO vault_share_keys (script_id, shared_with, encrypted_dek)
        VALUES (${script.id}, ${sharedWith}, ${encryptedDek})
        ON CONFLICT (script_id, shared_with) DO UPDATE SET encrypted_dek = ${encryptedDek}
      `;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Share key save error:', err);
      return res.status(500).json({ error: 'Failed to save share key' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
