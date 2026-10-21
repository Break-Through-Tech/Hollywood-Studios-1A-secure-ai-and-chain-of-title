import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureBlobColumns, ensureVaultEncryptionColumns, ensureVaultFoldersTable } from './_schema.js';

function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL!);
  const { ownerEmail, title, fileName, fileType, fileSize, fileData, blobUrl: uploadedUrl, projectType, privacy, status, collaborators,
          isEncrypted, encryptedDek, dekIv, encryptionIv, folderSlug } = req.body;

  // The file arrives one of two ways: already in Blob storage (the browser
  // uploaded it with a token from upload-token) or inline as a data URL.
  if (!ownerEmail || !title || !fileName || !fileType || (!fileData && !uploadedUrl)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (uploadedUrl && !/^https:\/\/[a-z0-9-]+\.(private\.)?blob\.vercel-storage\.com\//.test(String(uploadedUrl))) {
    return res.status(400).json({ error: 'blobUrl must point at Blob storage' });
  }

  try {
    await ensureBlobColumns(sql);
    await ensureVaultEncryptionColumns(sql);
    await ensureVaultFoldersTable(sql);
    const slug = generateSlug();

    let blobUrl: string | null = typeof uploadedUrl === 'string' ? uploadedUrl : null;

    const match = blobUrl ? null : String(fileData).match(/^data:(.+?);base64,(.+)$/);
    if (match) {
      const buffer = Buffer.from(match[2], 'base64');
      const blob = await put(`vault/${slug}/${fileName}`, buffer, {
        access: 'private',
        contentType: match[1],
      });
      blobUrl = blob.url;
    }

    const [row] = await sql`
      INSERT INTO vault_scripts (slug, owner_email, title, file_name, file_type, file_size, blob_url,
                                  item_kind, project_type, privacy, status, collaborators,
                                  is_encrypted, encrypted_dek, dek_iv, encryption_iv, folder_slug)
      VALUES (${slug}, ${ownerEmail}, ${title}, ${fileName}, ${fileType}, ${fileSize || 0}, ${blobUrl},
              'upload',
              ${projectType || 'other'}, ${privacy || 'private'},
              ${status || 'draft'}, ${collaborators || []},
              ${isEncrypted || false}, ${encryptedDek || null}, ${dekIv || null}, ${encryptionIv || null},
              ${folderSlug || null})
      RETURNING slug, title, file_name, file_type, file_size, item_kind, project_type, privacy, status, collaborators, is_encrypted, created_at
    `;
    return res.status(201).json(row);
  } catch (err) {
    console.error('Vault upload error:', err);
    return res.status(500).json({ error: 'Failed to upload script' });
  }
}
