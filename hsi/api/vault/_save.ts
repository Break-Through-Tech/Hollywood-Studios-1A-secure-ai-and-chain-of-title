import { neon } from '@neondatabase/serverless';
import { put, del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { ensureVaultEncryptionColumns, ensureVaultTrackingTables } from './_schema.js';

function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  await ensureVaultEncryptionColumns(sql);
  await ensureVaultTrackingTables(sql);
  const { slug, ownerEmail, title, status, fileData, fileSize, workspaceContent, workspaceContext, collaborators,
          isEncrypted, encryptedDek, dekIv, encryptionIv } = req.body;

  if (!slug || !ownerEmail) return res.status(400).json({ error: 'slug and ownerEmail are required' });

  try {
    const [existing] = await sql`
      SELECT id, title, status, file_data, file_size, file_name, file_type, blob_url,
             workspace_content, workspace_context, collaborators, current_version, is_encrypted
      FROM vault_scripts
      WHERE slug = ${slug} AND owner_email = ${ownerEmail}
    `;

    if (!existing) return res.status(403).json({ error: 'Not authorized or not found' });

    const nextTitle = typeof title === 'string' && title.trim() ? title.trim() : existing.title;
    const nextStatus = typeof status === 'string' ? status : existing.status;
    const nextFileSize = typeof fileSize === 'number' ? fileSize : existing.file_size;
    const nextWorkspaceContent = typeof workspaceContent === 'string' ? workspaceContent : existing.workspace_content;
    const nextWorkspaceContext = typeof workspaceContext === 'string' ? workspaceContext : existing.workspace_context;
    const nextCollaborators = Array.isArray(collaborators) ? collaborators : existing.collaborators;

    let nextBlobUrl = existing.blob_url;
    let nextFileData = existing.file_data;

    if (typeof fileData === 'string' && fileData !== existing.file_data) {
      const match = (fileData as string).match(/^data:(.+?);base64,(.+)$/);
      if (match) {
        const buffer = Buffer.from(match[2], 'base64');
        const blob = await put(`vault/${slug}/${existing.file_name || 'file'}`, buffer, {
          access: 'private',
          contentType: match[1],
        });
        if (existing.blob_url) await del(existing.blob_url).catch(() => {});
        nextBlobUrl = blob.url;
        nextFileData = null;
      } else {
        nextFileData = fileData;
      }
    }

    const nextEncrypted = typeof isEncrypted === 'boolean' ? isEncrypted : (existing.is_encrypted || false);
    const nextEncDek = typeof encryptedDek === 'string' ? encryptedDek : (existing.encrypted_dek || null);
    const nextDekIv = typeof dekIv === 'string' ? dekIv : (existing.dek_iv || null);
    const nextEncIv = typeof encryptionIv === 'string' ? encryptionIv : (existing.encryption_iv || null);

    let nextVersion = existing.current_version || 1;
    const contentChanged = typeof workspaceContent === 'string' && workspaceContent !== existing.workspace_content;
    const fileChanged = typeof fileData === 'string' && fileData !== existing.file_data;
    const hadContent = !!(existing.workspace_content || existing.file_data || existing.blob_url);
    if (!nextEncrypted && !existing.is_encrypted && hadContent && (contentChanged || fileChanged)) {
      nextVersion += 1;
      if (nextVersion === 2) {
        await sql`
          INSERT INTO vault_script_versions (script_id, version_number, workspace_content, content_hash, note)
          VALUES (${existing.id}, 1, ${existing.workspace_content || null},
                  ${contentHash(existing.workspace_content || existing.file_data || '')}, 'Original version')
          ON CONFLICT (script_id, version_number) DO NOTHING
        `;
      }
      await sql`
        INSERT INTO vault_script_versions (script_id, version_number, workspace_content, content_hash, note)
        VALUES (${existing.id}, ${nextVersion}, ${contentChanged ? nextWorkspaceContent : null},
                ${contentHash(contentChanged ? nextWorkspaceContent : fileData)},
                ${fileChanged ? 'File updated' : 'Content updated'})
        ON CONFLICT (script_id, version_number) DO NOTHING
      `;
    }

    const [item] = await sql`
      UPDATE vault_scripts
      SET title = ${nextTitle},
          status = ${nextStatus},
          file_data = ${nextFileData},
          file_size = ${nextFileSize},
          blob_url = ${nextBlobUrl},
          workspace_content = ${nextWorkspaceContent},
          workspace_context = ${nextWorkspaceContext},
          collaborators = ${nextCollaborators},
          is_encrypted = ${nextEncrypted},
          encrypted_dek = ${nextEncDek},
          dek_iv = ${nextDekIv},
          encryption_iv = ${nextEncIv},
          current_version = ${nextVersion}
      WHERE slug = ${slug} AND owner_email = ${ownerEmail}
      RETURNING slug, title, file_name, file_type, file_size, item_kind, project_type,
                privacy, status, collaborators, workspace_content, workspace_context,
                is_encrypted, created_at
    `;

    return res.status(200).json(item);
  } catch (err) {
    console.error('Vault save error:', err);
    return res.status(500).json({ error: 'Failed to save vault item' });
  }
}
