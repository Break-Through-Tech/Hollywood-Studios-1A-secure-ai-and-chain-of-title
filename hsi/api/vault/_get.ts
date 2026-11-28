import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveVaultAccess } from './_access.js';
import { ensureVaultTimestampsTable, ensureVaultEncryptionColumns, ensureVaultShareKeysTable } from './_schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { slug, email } = req.body;

  if (!slug || !email) return res.status(400).json({ error: 'slug and email are required' });

  try {
    const access = await resolveVaultAccess(sql, slug, email);
    if (!access) {
      const exists = await sql`SELECT 1 FROM vault_scripts WHERE slug = ${slug} LIMIT 1`;
      if (exists.length > 0) return res.status(403).json({ error: 'access_denied' });
      return res.status(404).json({ error: 'Vault item not found' });
    }

    const { item, role } = access;

    let shares: unknown[] = [];
    if (role === 'owner') {
      const shareRows = await sql`
        SELECT shared_with, permission FROM vault_shares WHERE script_id = ${item.id}
      `;
      shares = shareRows;
    }

    await ensureVaultEncryptionColumns(sql);
    await ensureVaultShareKeysTable(sql);

    const result: Record<string, unknown> = {
      slug: item.slug,
      owner_email: item.owner_email,
      title: item.title,
      file_name: item.file_name,
      file_type: item.file_type,
      file_size: item.file_size,
      item_kind: item.item_kind,
      project_type: item.project_type,
      privacy: item.privacy,
      status: item.status,
      collaborators: item.collaborators,
      workspace_content: item.workspace_content,
      workspace_context: item.workspace_context,
      created_at: item.created_at,
      shares,
      role,
      is_encrypted: item.is_encrypted || false,
    };

    if (role === 'owner') {
      result.encrypted_dek = item.encrypted_dek;
      result.dek_iv = item.dek_iv;
      result.encryption_iv = item.encryption_iv;
    }

    // Every role that can open the project can read it on screen. "download"
    // is the extra right to take the file away, enforced by the download route.
    result.file_data = item.file_data;
    result.blob_url = item.blob_url;

    if (item.is_encrypted && role !== 'owner') {
      const [shareKey] = await sql`
        SELECT encrypted_dek FROM vault_share_keys
        WHERE script_id = ${item.id} AND LOWER(shared_with) = LOWER(${email})
      `;
      if (shareKey) {
        result.share_encrypted_dek = shareKey.encrypted_dek;
        result.encryption_iv = item.encryption_iv;
      }
    }

    await ensureVaultTimestampsTable(sql);
    const timestamps = await sql`
      SELECT content_hash, ots_proof, status, created_at, confirmed_at
      FROM vault_timestamps WHERE vault_slug = ${slug}
      ORDER BY created_at DESC LIMIT 5`;
    result.timestamps = timestamps;

    return res.status(200).json(result);
  } catch (err) {
    console.error('Vault get error:', err);
    return res.status(500).json({ error: 'Failed to load vault item' });
  }
}
