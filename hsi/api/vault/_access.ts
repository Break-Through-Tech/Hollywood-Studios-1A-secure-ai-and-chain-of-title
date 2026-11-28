import type { NeonQueryFunction } from '@neondatabase/serverless';
import { get } from '@vercel/blob';
import { extractText } from 'unpdf';
import { ensureBlobColumns, ensureVaultAttachmentsTable } from './_schema.js';

export type VaultRole = 'owner' | 'viewer' | 'downloader';

export interface VaultRow {
  id: number;
  slug: string;
  owner_email: string;
  title: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number;
  file_data: string | null;
  blob_url: string | null;
  item_kind: string;
  project_type: string;
  privacy: string;
  status: string;
  collaborators: string[];
  workspace_content: string;
  workspace_context: string;
  is_encrypted: boolean | null;
  encrypted_dek?: string | null;
  dek_iv?: string | null;
  encryption_iv?: string | null;
  created_at: string;
}

export interface VaultAccess {
  item: VaultRow;
  role: VaultRole;
}

export async function resolveVaultAccess(
  sql: NeonQueryFunction<false, false>,
  slug: string,
  email: string,
): Promise<VaultAccess | null> {
  await ensureBlobColumns(sql);
  const rows = await sql`
    SELECT s.id, s.slug, s.owner_email, s.title, s.file_name, s.file_type, s.file_size,
           s.file_data, s.blob_url, s.item_kind, s.project_type, s.privacy, s.status,
           s.collaborators, s.workspace_content, s.workspace_context, s.is_encrypted, s.created_at,
           sh.permission AS share_permission
    FROM vault_scripts s
    LEFT JOIN vault_shares sh ON sh.script_id = s.id AND LOWER(sh.shared_with) = LOWER(${email})
    WHERE s.slug = ${slug}
  `;

  if (rows.length === 0) return null;

  const row = rows[0] as VaultRow & { share_permission: string | null };

  if (row.owner_email === email) {
    return { item: row, role: 'owner' };
  }

  if (row.share_permission === 'download') {
    return { item: row, role: 'downloader' };
  }

  if (row.share_permission === 'view') {
    return { item: row, role: 'viewer' };
  }

  return null;
}

function isPdf(bytes: Uint8Array): boolean {
  // %PDF magic bytes
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function bytesToText(bytes: Uint8Array): Promise<string> {
  if (isPdf(bytes)) {
    try {
      const { text } = await extractText(bytes, { mergePages: true });
      return text;
    } catch {
      return '';
    }
  }
  return new TextDecoder().decode(bytes);
}

export async function readScriptContent(item: {
  blob_url?: string | null;
  file_data?: string | null;
  workspace_content?: string | null;
}): Promise<string> {
  if (item.blob_url) {
    const result = await get(item.blob_url, { access: 'private' });
    if (!result || !result.stream) return '';
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const combined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return bytesToText(combined);
  }

  if (item.file_data) {
    const commaIdx = item.file_data.indexOf(',');
    if (commaIdx !== -1) {
      const meta = item.file_data.slice(0, commaIdx);
      const payload = item.file_data.slice(commaIdx + 1);
      try {
        if (meta.includes(';base64')) {
          // copy out of the shared Buffer pool — pdf.js reads the raw ArrayBuffer
          return bytesToText(new Uint8Array(Buffer.from(payload, 'base64')));
        }
        return decodeURIComponent(payload);
      } catch {
        return '';
      }
    }
    return item.file_data;
  }

  return item.workspace_content || '';
}

export async function readProjectContent(
  sql: NeonQueryFunction<false, false>,
  slug: string,
  item: {
    blob_url?: string | null;
    file_data?: string | null;
    workspace_content?: string | null;
    workspace_context?: string | null;
  },
): Promise<string> {
  const parts: string[] = [];

  const main = await readScriptContent(item);
  if (main.trim()) parts.push(main);

  await ensureVaultAttachmentsTable(sql);
  const attachments = await sql`
    SELECT file_name, file_data, blob_url FROM vault_attachments
    WHERE vault_slug = ${slug} ORDER BY created_at ASC
  `;
  for (const att of attachments) {
    try {
      const text = await readScriptContent({ blob_url: att.blob_url, file_data: att.file_data });
      if (text.trim()) parts.push(`=== ATTACHED FILE: ${att.file_name} ===\n\n${text}`);
    } catch {
      // skip unreadable attachments
    }
  }

  if (item.workspace_context?.trim()) {
    parts.push(`=== PROJECT BRIEF / CONTEXT ===\n\n${item.workspace_context}`);
  }

  return parts.join('\n\n');
}
