CREATE TABLE IF NOT EXISTS applications (
  id            SERIAL PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  roles         TEXT[] DEFAULT '{}',
  headline      TEXT,
  background    TEXT,
  genres        TEXT[] DEFAULT '{}',
  formats       TEXT[] DEFAULT '{}',
  focus_areas   TEXT[] DEFAULT '{}',
  interests     TEXT[] DEFAULT '{}',
  connections   TEXT[] DEFAULT '{}',
  why_join      TEXT,
  use_cases     TEXT[] DEFAULT '{}',
  use_case_detail TEXT,
  referred      BOOLEAN DEFAULT FALSE,
  has_ip        BOOLEAN DEFAULT FALSE,
  understands_curated BOOLEAN DEFAULT FALSE,
  agrees_standards    BOOLEAN DEFAULT FALSE,
  wants_updates       BOOLEAN DEFAULT FALSE,
  additional_info     TEXT,
  status        TEXT DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_email ON applications (email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  handle          TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  headline        TEXT,
  bio             TEXT,
  location        TEXT,
  avatar_url      TEXT,
  skills          JSONB DEFAULT '[]',
  representation  JSONB DEFAULT '[]',
  media_links     JSONB DEFAULT '[]',
  featured_credit_ids JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Directory profiles: seeded reference entries for public figures (not HSI members).
-- Rendered read-only, excluded from People and connection requests.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_directory      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source            TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source_url        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_attribution TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_is_directory ON profiles(is_directory);
-- Unique so re-running a seed updates the same person instead of duplicating them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_source_url ON profiles(source_url) WHERE source_url IS NOT NULL;

-- Entities (Movie, TV Show, Company, Music pages)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS entities (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('movie', 'tvshow', 'company', 'music')),
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  year        INTEGER,
  image_url   TEXT,
  genre       TEXT[] DEFAULT '{}',
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  created_by  INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_slug ON entities(slug);
CREATE INDEX IF NOT EXISTS idx_entities_created_by ON entities(created_by);
CREATE INDEX IF NOT EXISTS idx_entities_title_trgm ON entities USING gin (title gin_trgm_ops);

-- Entity page views, so "trending" reflects real traffic rather than a proxy.
-- viewer_key is a coarse per-viewer hash used only to collapse repeat hits.
CREATE TABLE IF NOT EXISTS entity_views (
  id         BIGSERIAL PRIMARY KEY,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  viewer_key TEXT,
  viewed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entity_views_recent ON entity_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_views_entity ON entity_views(entity_id, viewed_at DESC);

-- Credits (IMDB-style filmography)
CREATE TABLE IF NOT EXISTS credits (
  id          SERIAL PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department  TEXT NOT NULL,
  title       TEXT NOT NULL,
  year        INTEGER,
  role        TEXT,
  work_type   TEXT,
  entity_id   INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credits_profile ON credits(profile_id);
CREATE INDEX IF NOT EXISTS idx_credits_entity ON credits(entity_id);

-- Experience (LinkedIn-style work history)
CREATE TABLE IF NOT EXISTS experience (
  id          SERIAL PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company     TEXT NOT NULL,
  job_title   TEXT NOT NULL,
  start_date  DATE,
  end_date    DATE,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_experience_profile ON experience(profile_id);

-- Awards
CREATE TABLE IF NOT EXISTS awards (
  id          SERIAL PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  award_name  TEXT NOT NULL,
  category    TEXT,
  year        INTEGER,
  result      TEXT NOT NULL DEFAULT 'Nominated',
  project     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_awards_profile ON awards(profile_id);

-- Connections
CREATE TABLE IF NOT EXISTS connections (
  id            SERIAL PRIMARY KEY,
  from_profile  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_profile    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_profile, to_profile)
);
CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_profile);
CREATE INDEX IF NOT EXISTS idx_connections_to ON connections(to_profile);

-- User settings (extends profiles with auth/preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  id                    SERIAL PRIMARY KEY,
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT,
  auth_provider         TEXT DEFAULT 'email',
  milestones_enabled    BOOLEAN DEFAULT TRUE,
  stripe_customer_id    TEXT,
  subscription_id       TEXT,
  subscription_tier     TEXT,
  subscription_status   TEXT,
  trial_end             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_settings_email ON user_settings(email);

-- Linked social media pages
CREATE TABLE IF NOT EXISTS user_pages (
  id              SERIAL PRIMARY KEY,
  owner_email     TEXT NOT NULL,
  page_name       TEXT NOT NULL,
  platform        TEXT NOT NULL,
  page_url        TEXT,
  ai_watching     BOOLEAN DEFAULT FALSE,
  privacy         TEXT DEFAULT 'public',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_pages_owner ON user_pages(owner_email);

-- Access / referral codes
CREATE TABLE IF NOT EXISTS access_codes (
  id              SERIAL PRIMARY KEY,
  owner_email     TEXT NOT NULL,
  code            TEXT UNIQUE NOT NULL,
  invited_email   TEXT,
  used            BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_codes_owner ON access_codes(owner_email);

-- Vault scripts
CREATE TABLE IF NOT EXISTS vault_scripts (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  owner_email   TEXT NOT NULL,
  title         TEXT NOT NULL,
  file_name     TEXT,
  file_type     TEXT,
  file_size     INTEGER DEFAULT 0,
  file_data     TEXT,
  item_kind     TEXT NOT NULL DEFAULT 'upload',
  project_type  TEXT NOT NULL DEFAULT 'other',
  privacy       TEXT NOT NULL DEFAULT 'private',
  status        TEXT NOT NULL DEFAULT 'draft',
  collaborators TEXT[] DEFAULT '{}',
  workspace_content TEXT NOT NULL DEFAULT '',
  workspace_context TEXT NOT NULL DEFAULT '',
  is_encrypted  BOOLEAN DEFAULT FALSE,
  encrypted_dek TEXT,
  dek_iv        TEXT,
  encryption_iv TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_scripts_owner ON vault_scripts(owner_email);
CREATE INDEX IF NOT EXISTS idx_vault_scripts_slug ON vault_scripts(slug);

-- Vault shares
CREATE TABLE IF NOT EXISTS vault_shares (
  id          SERIAL PRIMARY KEY,
  script_id   INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  shared_with TEXT NOT NULL,
  permission  TEXT DEFAULT 'view',
  UNIQUE(script_id, shared_with)
);
CREATE INDEX IF NOT EXISTS idx_vault_shares_script ON vault_shares(script_id);

-- Vault attachments (files attached to workspace projects)
CREATE TABLE IF NOT EXISTS vault_attachments (
  id            SERIAL PRIMARY KEY,
  vault_slug    TEXT NOT NULL,
  owner_email   TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT,
  file_size     INTEGER DEFAULT 0,
  file_data     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_attachments_slug ON vault_attachments(vault_slug);

-- Vault analyses (Coverage / Relativity / Greenlight)
CREATE TABLE IF NOT EXISTS vault_analyses (
  id              SERIAL PRIMARY KEY,
  vault_slug      TEXT NOT NULL,
  owner_email     TEXT NOT NULL,
  tool            TEXT NOT NULL CHECK (tool IN ('coverage', 'relativity', 'greenlight')),
  status          TEXT NOT NULL DEFAULT 'pending',
  overall_score   INTEGER,
  dimensions      JSONB NOT NULL DEFAULT '[]',
  error_message   TEXT,
  script_breakdown JSONB,
  act_analyses    JSONB,
  detected_genre  TEXT,
  comp_ids        INTEGER[],
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vault_slug, owner_email, tool)
);
CREATE INDEX IF NOT EXISTS idx_vault_analyses_slug ON vault_analyses(vault_slug);
CREATE INDEX IF NOT EXISTS idx_vault_analyses_owner ON vault_analyses(owner_email);

-- Comp references (benchmark titles for analysis)
CREATE TABLE IF NOT EXISTS comp_references (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  year            INTEGER,
  genre           TEXT NOT NULL,
  subgenre        TEXT,
  tags            TEXT[] DEFAULT '{}',
  budget_tier     TEXT CHECK (budget_tier IN ('micro', 'low', 'mid', 'high', 'tentpole')),
  box_office_dom  BIGINT,
  box_office_intl BIGINT,
  rating          TEXT,
  platform        TEXT,
  strengths       TEXT[] DEFAULT '{}',
  weaknesses      TEXT[] DEFAULT '{}',
  audience_demo   TEXT,
  awards_note     TEXT,
  craft_summary   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_refs_genre ON comp_references(genre);
CREATE INDEX IF NOT EXISTS idx_comp_refs_tags ON comp_references USING gin(tags);

-- Posts (network feed)
CREATE TABLE IF NOT EXISTS posts (
  id            SERIAL PRIMARY KEY,
  profile_id    INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT,
  media         JSONB DEFAULT '[]',
  link_preview  JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_profile ON posts(profile_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Post likes
CREATE TABLE IF NOT EXISTS post_likes (
  id          SERIAL PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_profile ON post_likes(profile_id);

-- Conversations (1:1 messaging between friends)
CREATE TABLE IF NOT EXISTS conversations (
  id              SERIAL PRIMARY KEY,
  participant_a   TEXT NOT NULL,
  participant_b   TEXT NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_a, participant_b)
);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(participant_a);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(participant_b);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_email    TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  attachment_blob_url TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- User encryption keys (envelope encryption for vault + messaging)
CREATE TABLE IF NOT EXISTS user_crypto_keys (
  id                          SERIAL PRIMARY KEY,
  email                       TEXT UNIQUE NOT NULL,
  encrypted_kek               TEXT NOT NULL,
  kek_iv                      TEXT NOT NULL,
  kek_salt                    TEXT NOT NULL,
  kek_iterations              INTEGER DEFAULT 600000,
  public_key_jwk              JSONB NOT NULL,
  encrypted_private_key       TEXT NOT NULL,
  private_key_iv              TEXT NOT NULL,
  messaging_public_key_jwk    JSONB,
  encrypted_messaging_private_key TEXT,
  messaging_private_key_iv    TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Vault share keys (DEK re-encrypted for recipient)
CREATE TABLE IF NOT EXISTS vault_share_keys (
  id              SERIAL PRIMARY KEY,
  script_id       INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  shared_with     TEXT NOT NULL,
  encrypted_dek   TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(script_id, shared_with)
);

-- Vault timestamps (blockchain IP protection via OpenTimestamps)
CREATE TABLE IF NOT EXISTS vault_timestamps (
  id              SERIAL PRIMARY KEY,
  vault_slug      TEXT NOT NULL,
  owner_email     TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  ots_proof       TEXT,
  status          TEXT DEFAULT 'pending',
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vault_timestamps_slug ON vault_timestamps(vault_slug);
CREATE INDEX IF NOT EXISTS idx_vault_timestamps_hash ON vault_timestamps(content_hash);

-- Trackable share links (DocSend-style)
CREATE TABLE IF NOT EXISTS vault_share_links (
  id            SERIAL PRIMARY KEY,
  token         TEXT UNIQUE NOT NULL,
  script_id     INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  owner_email   TEXT NOT NULL,
  label         TEXT,
  require_email BOOLEAN DEFAULT TRUE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_share_links_script ON vault_share_links(script_id);

-- View sessions (per-visit tracking: duration, scroll depth, per-page time)
CREATE TABLE IF NOT EXISTS vault_view_sessions (
  id               SERIAL PRIMARY KEY,
  session_key      TEXT UNIQUE NOT NULL,
  script_id        INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  link_id          INTEGER REFERENCES vault_share_links(id) ON DELETE SET NULL,
  viewer_email     TEXT,
  viewer_name      TEXT,
  duration_seconds INTEGER DEFAULT 0,
  max_scroll_pct   INTEGER DEFAULT 0,
  pages_viewed     INTEGER DEFAULT 0,
  total_pages      INTEGER DEFAULT 0,
  page_times       JSONB DEFAULT '{}',
  user_agent       TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_active_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_view_sessions_script ON vault_view_sessions(script_id);

-- Notes on shared views (viewer feedback + owner private notes)
CREATE TABLE IF NOT EXISTS vault_view_notes (
  id            SERIAL PRIMARY KEY,
  script_id     INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  session_id    INTEGER REFERENCES vault_view_sessions(id) ON DELETE SET NULL,
  author_email  TEXT,
  kind          TEXT NOT NULL DEFAULT 'viewer',
  target_email  TEXT,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_view_notes_script ON vault_view_notes(script_id);

-- Link access controls (DocSend-style gates)
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS max_visits INTEGER;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS passcode_hash TEXT;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] DEFAULT '{}';
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT FALSE;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS notify_on_view BOOLEAN DEFAULT TRUE;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS nda_text TEXT;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS verify_email BOOLEAN DEFAULT FALSE;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
ALTER TABLE vault_share_links ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Session geolocation (from Vercel edge headers), notification + version stamps
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_country TEXT;
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_city TEXT;
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS ip_region TEXT;
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS owner_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS version_number INTEGER;
ALTER TABLE vault_view_sessions ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- One-time codes for viewer email verification on share links
CREATE TABLE IF NOT EXISTS vault_viewer_otps (
  id          SERIAL PRIMARY KEY,
  link_id     INTEGER NOT NULL REFERENCES vault_share_links(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  verified    BOOLEAN DEFAULT FALSE,
  attempts    INTEGER DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_viewer_otps_link ON vault_viewer_otps(link_id, email);

-- Timestamped click-through agreement signatures (NDA gate)
CREATE TABLE IF NOT EXISTS vault_link_signatures (
  id             SERIAL PRIMARY KEY,
  link_id        INTEGER NOT NULL REFERENCES vault_share_links(id) ON DELETE CASCADE,
  script_id      INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  session_id     INTEGER REFERENCES vault_view_sessions(id) ON DELETE SET NULL,
  signer_name    TEXT NOT NULL,
  signer_email   TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  agreement_hash TEXT NOT NULL,
  signed_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_link_signatures_link ON vault_link_signatures(link_id);

-- Content version history behind stable share links
CREATE TABLE IF NOT EXISTS vault_script_versions (
  id                SERIAL PRIMARY KEY,
  script_id         INTEGER NOT NULL REFERENCES vault_scripts(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  workspace_content TEXT,
  file_data         TEXT,
  blob_url          TEXT,
  content_hash      TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(script_id, version_number)
);
ALTER TABLE vault_scripts ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- OTP codes for email verification login
CREATE TABLE IF NOT EXISTS otp_codes (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);

-- API sessions issued at OTP login (Authorization: Bearer <token>)
CREATE TABLE IF NOT EXISTS user_sessions (
  id          SERIAL PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);

-- Featured profiles: the hand-picked people surfaced at the top of /people.
-- One row per person per cohort; the app renders whichever cohort has the
-- latest week_start, so a selection stays up until it is deliberately replaced
-- rather than expiring when the calendar week rolls over.
CREATE TABLE IF NOT EXISTS featured_profiles (
  id          SERIAL PRIMARY KEY,
  profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  blurb       TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_start, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_featured_profiles_week ON featured_profiles(week_start DESC, sort_order);

-- Company pages. The entity row is the company's identity — name (title),
-- logo (image_url), about (description), founded year (year) and its owner
-- (created_by). company_details holds what a company listing adds on top.
CREATE TABLE IF NOT EXISTS company_details (
  entity_id          INTEGER PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  tagline            TEXT,
  category           TEXT,
  organization_type  TEXT,
  company_size       TEXT,
  founded_month      SMALLINT CHECK (founded_month BETWEEN 1 AND 12),
  headquarters       TEXT,
  website            TEXT,
  contact_email      TEXT,
  phone              TEXT,
  specialties        TEXT[] NOT NULL DEFAULT '{}',
  social_links       JSONB NOT NULL DEFAULT '{}',
  cover_url          TEXT,
  notable_entity_ids INTEGER[] NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_details_category ON company_details(category);

-- Companies made before company_details existed kept their kind in metadata.
INSERT INTO company_details (entity_id, category)
SELECT id, CASE metadata->>'company_type'
             WHEN 'studio' THEN 'studio'
             WHEN 'agency' THEN 'talent-agency'
             WHEN 'production company' THEN 'production'
             WHEN 'label' THEN 'record-label'
           END
FROM entities WHERE type = 'company'
ON CONFLICT (entity_id) DO NOTHING;

-- A company page always belongs to a person. created_by is shared with titles,
-- which outlive their creator (SET NULL), so companies get their own rules:
-- one may never be ownerless, and it goes when its owner's profile goes.
DO $$ BEGIN
  ALTER TABLE entities ADD CONSTRAINT entities_company_has_owner CHECK (type <> 'company' OR created_by IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION delete_owned_company_pages() RETURNS trigger AS $$
BEGIN
  DELETE FROM entities WHERE type = 'company' AND created_by = OLD.id;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_delete_company_pages ON profiles;
CREATE TRIGGER trg_profiles_delete_company_pages
  BEFORE DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION delete_owned_company_pages();

-- An experience entry can point at a company page, which is how the page knows its people.
ALTER TABLE experience ADD COLUMN IF NOT EXISTS company_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_experience_company ON experience(company_entity_id);
