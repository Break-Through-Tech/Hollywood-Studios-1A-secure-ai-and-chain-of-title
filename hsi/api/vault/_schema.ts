import type { NeonQueryFunction } from '@neondatabase/serverless';

export function generateSlug() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let slug = '';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) slug += chars[bytes[i] % chars.length];
  return slug;
}

export async function ensureVaultAnalysesTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_analyses (
    id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
    tool TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', overall_score INTEGER,
    dimensions JSONB NOT NULL DEFAULT '[]', error_message TEXT,
    script_breakdown JSONB, act_analyses JSONB, detected_genre TEXT, comp_ids INTEGER[],
    started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vault_slug, owner_email, tool))`;
  await sql`ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS script_breakdown JSONB`;
  await sql`ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS act_analyses JSONB`;
  await sql`ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS detected_genre TEXT`;
  await sql`ALTER TABLE vault_analyses ADD COLUMN IF NOT EXISTS comp_ids INTEGER[]`;
}

export async function ensureCompReferencesTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS comp_references (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, year INTEGER, genre TEXT NOT NULL,
    subgenre TEXT, tags TEXT[] DEFAULT '{}',
    budget_tier TEXT, box_office_dom BIGINT, box_office_intl BIGINT,
    rating TEXT, platform TEXT,
    strengths TEXT[] DEFAULT '{}', weaknesses TEXT[] DEFAULT '{}',
    audience_demo TEXT, awards_note TEXT, craft_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comp_refs_genre ON comp_references(genre)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comp_refs_tags ON comp_references USING gin(tags)`;
}

export async function ensureVaultAttachmentsTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_attachments (
    id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
    file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER DEFAULT 0,
    file_data TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`ALTER TABLE vault_attachments ADD COLUMN IF NOT EXISTS blob_url TEXT`;
}

export async function ensureBlobColumns(sql: NeonQueryFunction<false, false>) {
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS blob_url TEXT`;
  await sql`ALTER TABLE vault_attachments ADD COLUMN IF NOT EXISTS blob_url TEXT`;
}

export async function ensureVaultTimestampsTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_timestamps (
    id SERIAL PRIMARY KEY, vault_slug TEXT NOT NULL, owner_email TEXT NOT NULL,
    content_hash TEXT NOT NULL, ots_proof TEXT,
    status TEXT DEFAULT 'pending', error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), confirmed_at TIMESTAMPTZ)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_timestamps_slug ON vault_timestamps(vault_slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_timestamps_hash ON vault_timestamps(content_hash)`;
}

export async function ensureMessageAttachmentColumns(sql: NeonQueryFunction<false, false>) {
  await sql`ALTER TABLE messages ALTER COLUMN content SET DEFAULT ''`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size INTEGER`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_blob_url TEXT`;
}

export async function ensureUserCryptoKeysTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS user_crypto_keys (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
    encrypted_kek TEXT NOT NULL, kek_iv TEXT NOT NULL,
    kek_salt TEXT NOT NULL, kek_iterations INTEGER DEFAULT 600000,
    public_key_jwk JSONB NOT NULL,
    encrypted_private_key TEXT NOT NULL, private_key_iv TEXT NOT NULL,
    messaging_public_key_jwk JSONB,
    encrypted_messaging_private_key TEXT, messaging_private_key_iv TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
}

export async function ensureVaultShareKeysTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_share_keys (
    id SERIAL PRIMARY KEY,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    shared_with TEXT NOT NULL, encrypted_dek TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(script_id, shared_with))`;
}

export async function ensureVaultEncryptionColumns(sql: NeonQueryFunction<false, false>) {
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS encrypted_dek TEXT`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS dek_iv TEXT`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS encryption_iv TEXT`;
}

export async function ensureVaultFoldersTable(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_folders (
    id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL, name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_folders_owner ON vault_folders(owner_email)`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS folder_slug TEXT`;
}

export function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 24; i++) token += chars[bytes[i] % chars.length];
  return token;
}

export async function ensureVaultTrackingTables(sql: NeonQueryFunction<false, false>) {
  await sql`CREATE TABLE IF NOT EXISTS vault_share_links (
    id SERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    owner_email TEXT NOT NULL, label TEXT,
    require_email BOOLEAN DEFAULT TRUE, is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_share_links_script ON vault_share_links(script_id)`;
  await sql`CREATE TABLE IF NOT EXISTS vault_view_sessions (
    id SERIAL PRIMARY KEY, session_key TEXT UNIQUE NOT NULL,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    link_id INTEGER REFERENCES vault_share_links(id) ON DELETE SET NULL,
    viewer_email TEXT, viewer_name TEXT,
    duration_seconds INTEGER DEFAULT 0, max_scroll_pct INTEGER DEFAULT 0,
    pages_viewed INTEGER DEFAULT 0, total_pages INTEGER DEFAULT 0,
    page_times JSONB DEFAULT '{}', user_agent TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(), last_active_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_view_sessions_script ON vault_view_sessions(script_id)`;
  await sql`CREATE TABLE IF NOT EXISTS vault_view_notes (
    id SERIAL PRIMARY KEY,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES vault_view_sessions(id) ON DELETE SET NULL,
    author_email TEXT, kind TEXT NOT NULL DEFAULT 'viewer',
    target_email TEXT, content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_view_notes_script ON vault_view_notes(script_id)`;

  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS max_visits INTEGER`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS passcode_hash TEXT`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] DEFAULT '{}'`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS notify_on_view BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS nda_text TEXT`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT TRUE`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS verify_email BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0`;
  await sql`ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`;

  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_country TEXT`;
  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_city TEXT`;
  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_region TEXT`;
  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS owner_notified BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS version_number INTEGER`;
  await sql`ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0`;

  await sql`CREATE TABLE IF NOT EXISTS vault_viewer_otps (
    id SERIAL PRIMARY KEY,
    link_id INTEGER NOT NULL REFERENCES vault_share_links(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_viewer_otps_link ON vault_viewer_otps(link_id, email)`;

  await sql`CREATE TABLE IF NOT EXISTS vault_link_signatures (
    id SERIAL PRIMARY KEY,
    link_id INTEGER NOT NULL REFERENCES vault_share_links(id) ON DELETE CASCADE,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES vault_view_sessions(id) ON DELETE SET NULL,
    signer_name TEXT NOT NULL, signer_email TEXT,
    ip_address TEXT, user_agent TEXT,
    agreement_hash TEXT NOT NULL,
    signed_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault_link_signatures_link ON vault_link_signatures(link_id)`;

  await sql`CREATE TABLE IF NOT EXISTS vault_script_versions (
    id SERIAL PRIMARY KEY,
    script_id INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    workspace_content TEXT, file_data TEXT, blob_url TEXT,
    content_hash TEXT, note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(script_id, version_number))`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1`;
}

export async function ensureVaultItemColumns(sql: NeonQueryFunction<false, false>) {
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'upload'`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS workspace_content TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS workspace_context TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS slug TEXT`;
  await sql`
    UPDATE vault_scripts
    SET item_kind = 'workspace'
    WHERE item_kind = 'upload'
      AND file_name IS NULL
      AND file_data IS NULL
  `;
  const missing = await sql`SELECT id FROM vault_scripts WHERE slug IS NULL`;
  for (const row of missing) {
    const slug = generateSlug();
    await sql`UPDATE vault_scripts SET slug = ${slug} WHERE id = ${row.id}`;
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_scripts_slug ON vault_scripts(slug)`;
}
