import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { VaultAnalysisPanel } from './VaultAnalysisPanel';
import { VaultTrackingPanel } from './VaultTrackingPanel';
import { DraftAssistantPanel } from './DraftAssistantPanel';
import { DraftChatWidget } from './DraftChatWidget';
import { useViewTracking } from '../hooks/useViewTracking';
import { blobUrl } from '../blobUrl';
import {
  encryptContent, decryptContent, unlockKEK, cacheKEK, getCachedKEK,
  unwrapDEKWithPrivateKey, decryptContentWithDEK,
} from '../crypto';

const OWNER_EMAIL = localStorage.getItem('hsi-user-email') || '';

type ProjectType = 'script' | 'treatment' | 'pitch_deck' | 'contract' | 'other';
type Privacy = 'public' | 'private' | 'shared';
type Status = 'draft' | 'in_review' | 'final';
type ItemKind = 'upload' | 'workspace';

interface Share { shared_with: string; permission: string }

type VaultRole = 'owner' | 'viewer' | 'downloader';

interface VaultTimestamp {
  content_hash: string;
  ots_proof: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

interface VaultItem {
  slug: string;
  owner_email: string;
  title: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number;
  file_data: string | null;
  item_kind: ItemKind;
  project_type: ProjectType;
  privacy: Privacy;
  status: Status;
  collaborators: string[];
  workspace_content: string;
  workspace_context: string;
  created_at: string;
  shares: Share[] | string;
  role?: VaultRole;
  timestamps?: VaultTimestamp[];
  is_encrypted?: boolean;
  encrypted_dek?: string;
  dek_iv?: string;
  encryption_iv?: string;
  share_encrypted_dek?: string;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const STATUS_OPTIONS: Status[] = ['draft', 'in_review', 'final'];

const IMPORT_TYPES = ['.txt', '.fdx', '.fountain'];
const IMPORT_BUTTON_TYPES = [...IMPORT_TYPES, '.pdf'];
const ATTACH_TYPES = ['.pdf', '.docx', '.txt', '.fdx', '.fountain', '.png', '.jpg', '.jpeg'];

interface Attachment {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

function isPdfAttachment(att: Attachment): boolean {
  return (att.file_type || '').toLowerCase().includes('pdf') || att.file_name.toLowerCase().endsWith('.pdf');
}

const PROJECT_LABELS: Record<ProjectType, string> = {
  script: 'Script',
  treatment: 'Treatment',
  pitch_deck: 'Pitch Deck',
  contract: 'Contract',
  other: 'Other',
};

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

function statusLabel(status: Status) {
  if (status === 'in_review') return 'In Review';
  if (status === 'final') return 'Final';
  return 'Draft';
}

function parseShares(shares: Share[] | string): Share[] {
  if (typeof shares === 'string') {
    try { return JSON.parse(shares); } catch { return []; }
  }
  return shares || [];
}

function fileIcon(ext: string) {
  const e = ext?.toLowerCase();
  if (e === 'pdf') return 'PDF';
  if (e === 'docx') return 'DOC';
  if (e === 'txt' || e === 'fountain') return 'TXT';
  if (e === 'fdx') return 'FDX';
  if (e === 'png' || e === 'jpg' || e === 'jpeg') return 'IMG';
  return 'FILE';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) { resolve(result); return; }
      const meta = result.slice(0, commaIdx);
      const payload = result.slice(commaIdx + 1);
      try {
        if (meta.includes(';base64')) resolve(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))));
        else resolve(decodeURIComponent(payload));
      } catch { resolve(''); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isTextEditable(item: VaultItem) {
  const ext = item.file_type?.toLowerCase();
  return ext === 'txt' || ext === 'fdx' || ext === 'fountain';
}

function dataUrlMime(fileData: string | null) {
  if (!fileData) return 'text/plain';
  const match = fileData.match(/^data:([^;,]+)/);
  return match?.[1] || 'text/plain';
}

function decodeDataUrlText(fileData: string | null) {
  if (!fileData) return '';
  const commaIndex = fileData.indexOf(',');
  if (commaIndex === -1) return fileData;

  const meta = fileData.slice(0, commaIndex);
  const payload = fileData.slice(commaIndex + 1);

  try {
    if (meta.includes(';base64')) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return '';
  }
}

function encodeTextDataUrl(text: string, mime: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([text], { type: mime }));
  });
}

function initialScriptText(item: VaultItem) {
  const decoded = isTextEditable(item) ? decodeDataUrlText(item.file_data) : '';
  return item.workspace_content || decoded;
}

async function decryptVaultContent(item: VaultItem & { role: VaultRole }, kek: CryptoKey, email: string): Promise<string> {
  const contentSource = item.workspace_content || (isTextEditable(item) ? decodeDataUrlText(item.file_data) : '');
  if (!contentSource) return '';

  if (item.role === 'owner' && item.encrypted_dek && item.dek_iv && item.encryption_iv) {
    return decryptContent({
      ciphertext: contentSource,
      iv: item.encryption_iv,
      encryptedDek: item.encrypted_dek,
      dekIv: item.dek_iv,
    }, kek);
  }

  if (item.share_encrypted_dek && item.encryption_iv) {
    const keysRes = await fetch(`/api/vault/crypto-keys?email=${encodeURIComponent(email)}`);
    if (!keysRes.ok) throw new Error('Cannot load encryption keys');
    const keys = await keysRes.json();
    const dek = await unwrapDEKWithPrivateKey(item.share_encrypted_dek, keys.encrypted_private_key, keys.private_key_iv, kek);
    return decryptContentWithDEK(contentSource, item.encryption_iv, dek);
  }

  return contentSource;
}

async function loadVaultItem(slug: string, email: string): Promise<VaultItem & { role: VaultRole }> {
  const res = await fetch('/api/vault/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load vault item');
  }
  return res.json();
}

interface FriendOption {
  email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

function FriendAvatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    return <img src={blobUrl(src) || src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ShareToFriendModal({ slug, title, kind, onClose }: { slug: string; title: string; kind: ItemKind; onClose: () => void }) {
  const email = localStorage.getItem('hsi-user-email') || '';
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<'view' | 'download'>('view');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/network/messages/friends?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : { friends: [] })
      .then(d => setFriends(d.friends || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  const filtered = friends.filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (f.display_name || '').toLowerCase().includes(q)
      || (f.handle || '').toLowerCase().includes(q)
      || f.email.toLowerCase().includes(q);
  });

  async function handleSend(friend: FriendOption) {
    setSending(friend.email);
    setError('');
    try {
      const grant = await fetch('/api/vault/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email, sharedWith: friend.email, permission }),
      });
      if (!grant.ok) {
        const d = await grant.json().catch(() => ({}));
        setError(d.error || `Could not grant access to ${friend.display_name || friend.email}`);
        setSending(null);
        return;
      }

      const shareUrl = `${window.location.origin}/vault/${kind === 'workspace' ? 'workspace' : 'script'}/${slug}`;
      const getOrCreate = await fetch('/api/network/messages/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, toEmail: friend.email }),
      });
      if (!getOrCreate.ok) { setSending(null); return; }

      await fetch('/api/network/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, toEmail: friend.email, content: `Check out my project "${title}"\n${shareUrl}` }),
      });
      setSent(prev => new Set(prev).add(friend.email));
    } catch { setError('Network error — please try again'); }
    setSending(null);
  }

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal">
        <h2 className="vault-modal-title">Share to Messages</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>Send "{title}" to a friend — they'll automatically get access</p>
        <div className="vault-permission-toggle" style={{ marginBottom: 14 }}>
          <button className={`vault-perm-btn ${permission === 'view' ? 'active' : ''}`} onClick={() => setPermission('view')}>View only</button>
          <button className={`vault-perm-btn ${permission === 'download' ? 'active' : ''}`} onClick={() => setPermission('download')}>Download</button>
        </div>
        <div className="vault-share-friend-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="vault-modal-input"
            placeholder="Search friends..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ border: 'none', padding: '0', flex: 1 }}
          />
        </div>
        <div className="vault-share-friend-list">
          {loading ? (
            <p className="vault-share-friend-empty">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="vault-share-friend-empty">{search ? 'No friends match your search' : 'No friends yet'}</p>
          ) : (
            filtered.map(f => (
              <div key={f.email} className="vault-share-friend-row">
                <FriendAvatar name={f.display_name || f.email} src={f.avatar_url} size={36} />
                <div className="vault-share-friend-info">
                  <span className="vault-share-friend-name">{f.display_name || f.email}</span>
                  {f.handle && <span className="vault-share-friend-handle">@{f.handle}</span>}
                </div>
                {sent.has(f.email) ? (
                  <span className="vault-share-friend-sent">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    Sent
                  </span>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSend(f)}
                    disabled={sending === f.email}
                  >
                    {sending === f.email ? 'Sending...' : 'Send'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        {error && <p className="vault-modal-error">{error}</p>}
        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </>
  );
}

function IPProtectionSection({ slug, email, contentText, timestamps: initialTimestamps, isOwner }: {
  slug: string;
  email: string;
  contentText: string;
  timestamps: VaultTimestamp[];
  isOwner: boolean;
}) {
  const [timestamps, setTimestamps] = useState(initialTimestamps);
  const [registering, setRegistering] = useState(false);
  const [checking, setChecking] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setTimestamps(initialTimestamps); }, [initialTimestamps]);

  useEffect(() => {
    if (!contentText.trim()) return;
    sha256Hex(contentText).then(setCurrentHash);
  }, [contentText]);

  const latestTimestamp = timestamps[0] || null;
  const contentChanged = latestTimestamp && currentHash && latestTimestamp.content_hash !== currentHash;
  const hasConfirmed = timestamps.some(t => t.status === 'confirmed');
  const hasPending = timestamps.some(t => t.status === 'pending');

  async function handleRegister() {
    setRegistering(true);
    setError('');
    try {
      const res = await fetch('/api/vault/timestamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to register'); return; }
      setTimestamps(prev => [data.timestamp, ...prev]);
    } catch { setError('Network error'); }
    setRegistering(false);
  }

  async function handleCheckStatus() {
    setChecking(true);
    try {
      const res = await fetch('/api/vault/timestamp-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email }),
      });
      if (res.ok) {
        const data = await res.json();
        setTimestamps(data.timestamps);
      }
    } catch { /* */ }
    setChecking(false);
  }

  function downloadProof(ts: VaultTimestamp) {
    if (!ts.ots_proof) return;
    const bytes = Uint8Array.from(atob(ts.ots_proof), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-${ts.content_hash.slice(0, 8)}.ots`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="vault-context-section">
      <div className="vault-panel-top vault-panel-top--compact">
        <div>
          <span className="vault-panel-kicker">IP Protection</span>
          <h2>Blockchain Timestamp</h2>
        </div>
        {hasConfirmed && (
          <span className="vault-ts-confirmed-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            Verified
          </span>
        )}
      </div>

      {timestamps.length === 0 ? (
        <div className="vault-ts-empty">
          <p>No timestamps yet. Register your content on the Bitcoin blockchain to prove authorship.</p>
          {isOwner && (
            <button className="btn btn-primary btn-sm" onClick={handleRegister} disabled={registering || !contentText.trim()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              {registering ? 'Registering...' : 'Register on Blockchain'}
            </button>
          )}
        </div>
      ) : (
        <div className="vault-ts-list">
          {contentChanged && (
            <div className="vault-ts-warning">
              Content has changed since last timestamp. Register again to protect the updated version.
            </div>
          )}
          {timestamps.map((ts, i) => (
            <div key={i} className="vault-ts-row">
              <div className="vault-ts-status-icon">
                {ts.status === 'confirmed' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                ) : ts.status === 'pending' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bad)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                )}
              </div>
              <div className="vault-ts-info">
                <span className="vault-ts-hash" title={ts.content_hash}>
                  SHA-256: {ts.content_hash.slice(0, 16)}...
                </span>
                <span className="vault-ts-date">
                  {ts.status === 'confirmed' && ts.confirmed_at
                    ? `Confirmed ${formatDate(ts.confirmed_at)}`
                    : ts.status === 'pending'
                    ? `Submitted ${formatDate(ts.created_at)} — awaiting Bitcoin confirmation`
                    : `Failed ${formatDate(ts.created_at)}`}
                </span>
              </div>
              {ts.ots_proof && (
                <button className="vault-ts-download" onClick={() => downloadProof(ts)} title="Download .ots proof">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                </button>
              )}
            </div>
          ))}
          <div className="vault-ts-actions">
            {isOwner && (contentChanged || !latestTimestamp) && (
              <button className="btn btn-primary btn-sm" onClick={handleRegister} disabled={registering}>
                {registering ? 'Registering...' : 'Register New Version'}
              </button>
            )}
            {hasPending && (
              <button className="btn btn-secondary btn-sm" onClick={handleCheckStatus} disabled={checking}>
                {checking ? 'Checking...' : 'Check Status'}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="vault-modal-error" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}

function VaultItemHeader({
  slug,
  title,
  status,
  type,
  kind,
  saving,
  savedAt,
  role = 'owner',
  onTitleChange,
  onStatusChange,
  onSave,
}: {
  slug: string;
  title: string;
  status: Status;
  type: ProjectType;
  kind: ItemKind;
  saving: boolean;
  savedAt: string;
  role?: VaultRole;
  onTitleChange: (value: string) => void;
  onStatusChange: (value: Status) => void;
  onSave: () => void;
}) {
  const isOwner = role === 'owner';
  const [showShareModal, setShowShareModal] = useState(false);
  return (
    <>
      <header className="vault-work-header">
        <div className="vault-work-heading">
          <Link className="vault-work-back" to="/vault">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Creative OS
          </Link>
          {isOwner ? (
            <input className="vault-work-title-input" value={title} onChange={(e) => onTitleChange(e.target.value)} />
          ) : (
            <span className="vault-work-title-input" style={{ cursor: 'default' }}>{title}</span>
          )}
          <div className="vault-work-badges">
            <span className="vault-work-badge">{kind === 'workspace' ? 'Workspace' : 'Uploaded Project'}</span>
            <span className="vault-work-badge">{PROJECT_LABELS[type]}</span>
            {!isOwner && <span className="vault-work-badge" style={{ background: 'var(--navy-tint)', color: 'var(--navy)' }}>{role}</span>}
          </div>
        </div>
        <div className="vault-work-actions">
          {isOwner && (
            <button className="btn btn-secondary" onClick={() => setShowShareModal(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share
            </button>
          )}
          {isOwner ? (
            <>
              <select className="vault-work-select" value={status} onChange={(e) => onStatusChange(e.target.value as Status)}>
                {STATUS_OPTIONS.map(option => <option key={option} value={option}>{statusLabel(option)}</option>)}
              </select>
              {savedAt && <span className="vault-work-saved">{savedAt}</span>}
              <button className="btn btn-primary" onClick={onSave} disabled={saving || !title.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <span className="vault-work-saved">{statusLabel(status)}</span>
          )}
        </div>
      </header>
      {showShareModal && (
        <ShareToFriendModal slug={slug} title={title} kind={kind} onClose={() => setShowShareModal(false)} />
      )}
    </>
  );
}

function EncryptionPasswordPrompt({ onUnlock, onCancel }: { onUnlock: (kek: CryptoKey) => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [err, setErr] = useState('');
  const email = localStorage.getItem('hsi-user-email') || '';

  async function handleUnlock() {
    if (!password) return;
    setUnlocking(true);
    setErr('');
    try {
      const res = await fetch(`/api/vault/crypto-keys?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error('No encryption keys found');
      const keys = await res.json();
      const kek = await unlockKEK(password, keys.encrypted_kek, keys.kek_iv, keys.kek_salt);
      cacheKEK(kek);
      onUnlock(kek);
    } catch {
      setErr('Incorrect password or missing encryption keys');
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="set-modal-backdrop" onClick={onCancel}>
      <div className="set-modal" onClick={e => e.stopPropagation()}>
        <h3 className="set-modal-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: -3 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Unlock Encrypted Content
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', margin: '0 0 12px' }}>Enter your encryption password to decrypt this item.</p>
        <input
          type="password"
          className="set-input"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Encryption password"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
        />
        {err && <p className="set-error">{err}</p>}
        <div className="set-modal-actions">
          <button className="set-btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="set-btn-primary" onClick={handleUnlock} disabled={unlocking}>{unlocking ? 'Unlocking...' : 'Unlock'}</button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="vault-work-container">
      <div className="vault-empty">Loading...</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const isAccessDenied = message === 'access_denied';
  return (
    <div className="vault-work-container">
      <div className="vault-empty">
        {isAccessDenied ? (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p style={{ fontWeight: 600, color: 'rgba(0,0,0,0.7)', marginBottom: 4 }}>You don't have access</p>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>Ask the owner to share this project with your email.</p>
          </>
        ) : (
          <p>{message}</p>
        )}
        <Link className="btn btn-primary" to="/vault">Back to Creative OS</Link>
      </div>
    </div>
  );
}

type ProjectTab = 'overview' | 'tracking';

interface TrackingSnapshot {
  visits: number;
  uniqueViewers: number;
  newViews: number;
}

function useTrackingSnapshot(slug: string | undefined, email: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  useEffect(() => {
    if (!enabled || !slug) return;
    let active = true;
    fetch('/api/vault/tracking/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ownerEmail: email }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active || !data) return;
        const sessions: { started_at: string; viewer_email: string | null; link_id: number | null }[] = data.sessions || [];
        const seen = Number(localStorage.getItem(`hsi-tracking-seen-${slug}`)) || 0;
        setSnapshot({
          visits: sessions.length,
          uniqueViewers: new Set(sessions.map(s => s.viewer_email || `anon-${s.link_id ?? 'x'}`)).size,
          newViews: sessions.filter(s => new Date(s.started_at).getTime() > seen).length,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [slug, email, enabled]);
  return [snapshot, setSnapshot] as const;
}

function VaultItemTabs({ active, onSelect, snapshot }: {
  active: ProjectTab;
  onSelect: (tab: ProjectTab) => void;
  snapshot: TrackingSnapshot | null;
}) {
  return (
    <div className="vault-tabs vault-item-tabs">
      <button className={`vault-tab ${active === 'overview' ? 'active' : ''}`} onClick={() => onSelect('overview')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
        Project
      </button>
      <button className={`vault-tab ${active === 'tracking' ? 'active' : ''}`} onClick={() => onSelect('tracking')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        Tracking
        {snapshot && snapshot.visits > 0 && <span className="vault-tab-count">{snapshot.visits}</span>}
        {snapshot && snapshot.newViews > 0 && <span className="vault-tab-alert">{snapshot.newViews} new</span>}
      </button>
    </div>
  );
}

export function VaultScriptPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;
  const [item, setItem] = useState<VaultItem | null>(null);
  const [role, setRole] = useState<VaultRole>('owner');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('draft');
  const [scriptText, setScriptText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [error, setError] = useState('');
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [kek, setKek] = useState<CryptoKey | null>(null);
  const [hasEncryptionKeys, setHasEncryptionKeys] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [scriptView, setScriptView] = useState<'pdf' | 'text'>('pdf');
  const pendingItemRef = useRef<(VaultItem & { role: VaultRole }) | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [trackingSnapshot, setTrackingSnapshot] = useTrackingSnapshot(slug, email, !!item && role === 'owner');
  const requestedTab: ProjectTab = searchParams.get('tab') === 'tracking' ? 'tracking' : 'overview';
  const selectTab = useCallback((tab: ProjectTab) => {
    setSearchParams(tab === 'tracking' ? { tab: 'tracking' } : {}, { replace: true });
    if (tab === 'tracking') setTrackingSnapshot(s => (s ? { ...s, newViews: 0 } : s));
  }, [setSearchParams, setTrackingSnapshot]);

  const { reportScroll } = useViewTracking({
    enabled: !!item && role !== 'owner',
    slug: item?.slug,
    viewerEmail: email,
  });

  useEffect(() => {
    fetch(`/api/vault/crypto-keys?email=${encodeURIComponent(email)}`)
      .then(r => { if (r.ok) setHasEncryptionKeys(true); })
      .catch(() => {});
  }, [email]);

  const isPdfItem = item?.file_type?.toLowerCase() === 'pdf' || item?.file_name?.toLowerCase().endsWith('.pdf');
  // Anyone who can open the project can read it on screen; downloading is separate.
  const canReadFile = role === 'owner' || role === 'downloader' || role === 'viewer';

  useEffect(() => {
    if (!item || !isPdfItem || !canReadFile || item.is_encrypted) return;
    let active = true;
    let objectUrl = '';

    async function loadPdf() {
      try {
        const res = await fetch('/api/vault/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: item!.slug, email }),
        });
        if (!res.ok || !active) return;
        if (res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json();
          if (data.file_data && active) setPdfUrl(data.file_data);
          return;
        }
        const blob = await res.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
        setPdfUrl(objectUrl);
      } catch { /* preview unavailable */ }
    }

    loadPdf();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item, isPdfItem, canReadFile, email]);

  useEffect(() => {
    if (!item || !isPdfItem || item.is_encrypted || !canReadFile) return;
    if (item.workspace_content || isTextEditable(item)) return;
    let active = true;

    (async () => {
      await Promise.resolve();
      if (!active) return;
      setExtracting(true);
      try {
        const res = await fetch('/api/vault/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: item.slug, email }),
        });
        const data = res.ok ? await res.json() : null;
        if (active && data?.text) setScriptText(data.text);
      } catch { /* extraction unavailable */ }
      if (active) setExtracting(false);
    })();

    return () => { active = false; };
  }, [item, isPdfItem, canReadFile, email]);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    async function load() {
      try {
        const nextItem = await loadVaultItem(slug!, email);
        if (!active) return;
        if (nextItem.item_kind === 'workspace') {
          navigate(`/vault/workspace/${nextItem.slug}`, { replace: true });
          return;
        }

        if (nextItem.is_encrypted) {
          const cachedKek = await getCachedKEK();
          if (cachedKek) {
            setKek(cachedKek);
            const decrypted = await decryptVaultContent(nextItem, cachedKek, email);
            if (!active) return;
            nextItem.workspace_content = decrypted;
            setItem(nextItem);
            setRole(nextItem.role || 'owner');
            setTitle(nextItem.title);
            setStatus(nextItem.status);
            setScriptText(decrypted);
            setIsEncrypted(true);
          } else {
            pendingItemRef.current = nextItem;
            setNeedsPassword(true);
            setIsEncrypted(true);
            return;
          }
        } else {
          setItem(nextItem);
          setRole(nextItem.role || 'owner');
          setTitle(nextItem.title);
          setStatus(nextItem.status);
          setScriptText(initialScriptText(nextItem));
          setIsEncrypted(false);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load vault item');
      }
    }

    load();
    return () => { active = false; };
  }, [slug, email, navigate]);

  const editableSource = useMemo(() => item ? isTextEditable(item) : false, [item]);
  const shares = useMemo(() => item ? parseShares(item.shares) : [], [item]);

  async function handlePasswordUnlock(unlockedKek: CryptoKey) {
    setKek(unlockedKek);
    setNeedsPassword(false);
    const pending = pendingItemRef.current;
    if (!pending) return;
    try {
      const decrypted = await decryptVaultContent(pending, unlockedKek, email);
      pending.workspace_content = decrypted;
      setItem(pending);
      setRole(pending.role || 'owner');
      setTitle(pending.title);
      setStatus(pending.status);
      setScriptText(decrypted);
    } catch {
      setError('Failed to decrypt content');
    }
    pendingItemRef.current = null;
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        slug: item.slug,
        ownerEmail: email,
        title,
        status,
      };

      if (isEncrypted && kek) {
        const encrypted = await encryptContent(scriptText, kek);
        payload.workspaceContent = encrypted.ciphertext;
        payload.isEncrypted = true;
        payload.encryptedDek = encrypted.encryptedDek;
        payload.dekIv = encrypted.dekIv;
        payload.encryptionIv = encrypted.iv;
        if (editableSource) {
          payload.fileData = await encodeTextDataUrl(encrypted.ciphertext, dataUrlMime(item.file_data));
          payload.fileSize = new Blob([encrypted.ciphertext]).size;
        }
      } else {
        payload.workspaceContent = scriptText;
        if (editableSource) {
          payload.fileData = await encodeTextDataUrl(scriptText, dataUrlMime(item.file_data));
          payload.fileSize = new Blob([scriptText]).size;
        }
      }

      const res = await fetch('/api/vault/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save script');
      }
      const saved = await res.json();
      setItem(prev => prev ? { ...prev, ...saved, file_data: (payload.fileData as string | undefined) || prev.file_data } : prev);
      setSavedAt('Saved just now');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save script');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEncryption() {
    if (!hasEncryptionKeys) {
      setError('Set up encryption in Settings first');
      return;
    }
    if (!isEncrypted) {
      const cachedKek = await getCachedKEK();
      if (cachedKek) {
        setKek(cachedKek);
        setIsEncrypted(true);
        setSavedAt('');
      } else {
        setNeedsPassword(true);
      }
    } else {
      setIsEncrypted(false);
      setSavedAt('');
    }
  }

  if (needsPassword) {
    return (
      <>
        {item ? null : <LoadingState />}
        <EncryptionPasswordPrompt
          onUnlock={handlePasswordUnlock}
          onCancel={() => { setNeedsPassword(false); if (!item) navigate('/vault'); }}
        />
      </>
    );
  }

  if (error && !item) return <ErrorState message={error} />;
  if (!item) return <LoadingState />;

  const isOwner = role === 'owner';
  const canDownload = role === 'owner' || role === 'downloader';
  const showTracking = isOwner && requestedTab === 'tracking';

  const scriptCopyGuard = !isOwner ? {
    onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
    onCut: (e: React.ClipboardEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  } : {};

  async function handleDownload() {
    try {
      const res = await fetch('/api/vault/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item!.slug, email }),
      });
      if (!res.ok) return;
      const contentDisp = res.headers.get('content-disposition');
      if (contentDisp) {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = item!.file_name || item!.title;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const data = await res.json();
        if (data.file_data) {
          const a = document.createElement('a');
          a.href = data.file_data;
          a.download = data.file_name || item!.title;
          a.click();
        }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className={`vault-work-container${!isOwner ? ' vault-no-copy' : ''}`} {...scriptCopyGuard}>
      <VaultItemHeader
        slug={item.slug}
        title={title}
        status={status}
        type={item.project_type}
        kind={item.item_kind}
        saving={saving}
        savedAt={savedAt}
        role={role}
        onTitleChange={setTitle}
        onStatusChange={setStatus}
        onSave={handleSave}
      />

      {isOwner && (
        <VaultItemTabs
          active={showTracking ? 'tracking' : 'overview'}
          onSelect={selectTab}
          snapshot={trackingSnapshot}
        />
      )}

      {showTracking ? (
        <VaultTrackingPanel slug={item.slug} email={email} isEncrypted={!!item.is_encrypted} />
      ) : (
      <>
      <div className="vault-script-layout">
        <section className="vault-editor-panel">
          <div className="vault-panel-top">
            <div>
              <span className="vault-panel-kicker">Script</span>
              <h2>{item.file_name || title}</h2>
            </div>
            <div className="vault-panel-top-actions">
              {pdfUrl && (
                <div className="vault-view-toggle" role="tablist">
                  <button
                    className={`vault-view-toggle-btn ${scriptView === 'pdf' ? 'vault-view-toggle-btn--active' : ''}`}
                    onClick={() => setScriptView('pdf')}
                  >
                    PDF
                  </button>
                  <button
                    className={`vault-view-toggle-btn ${scriptView === 'text' ? 'vault-view-toggle-btn--active' : ''}`}
                    onClick={() => setScriptView('text')}
                  >
                    Text
                  </button>
                </div>
              )}
              <span className={`vault-badge vault-badge--status vault-badge--${status}`}>{statusLabel(status)}</span>
            </div>
          </div>
          {pdfUrl && scriptView === 'pdf' ? (
            <iframe className="vault-pdf-frame" src={pdfUrl} title={item.file_name || title} />
          ) : (
            <textarea
              className="vault-script-editor"
              value={scriptText}
              onChange={(e) => { if (isOwner) setScriptText(e.target.value); }}
              onScroll={!isOwner ? (e) => {
                const el = e.currentTarget;
                reportScroll(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100);
              } : undefined}
              readOnly={!isOwner}
              spellCheck={false}
              placeholder={extracting ? 'Extracting text from file...' : undefined}
            />
          )}
          {error && <p className="vault-modal-error">{error}</p>}
        </section>

        <aside className="vault-side-panel">
          <div className="vault-side-section">
            <span className="vault-panel-kicker">Original</span>
            <div className="vault-file-row">
              <span className="vault-file-emoji">📄</span>
              <div>
                <strong>{item.file_name || 'Untitled file'}</strong>
                <span>{item.file_type?.toUpperCase() || 'FILE'} / {formatSize(item.file_size)}</span>
              </div>
            </div>
            {canDownload && pdfUrl ? null : isOwner && item.file_data ? (
              <a className="vault-original-link" href={item.file_data} download={item.file_name || title}>Open Original</a>
            ) : canDownload && !isOwner ? (
              <button className="vault-original-link" onClick={handleDownload} style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0, textDecoration: 'underline' }}>
                Download File
              </button>
            ) : null}
          </div>

          {isOwner && (
            <div className="vault-side-section">
              <span className="vault-panel-kicker">Security</span>
              <button
                className={`vault-encrypt-toggle ${isEncrypted ? 'active' : ''}`}
                onClick={toggleEncryption}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {isEncrypted ? 'Encrypted' : 'Encrypt this project'}
              </button>
              {isEncrypted && <p className="vault-encrypt-hint">Content is encrypted before saving. Only you and shared users can read it.</p>}
              {!hasEncryptionKeys && <p className="vault-encrypt-hint">Enable encryption in Settings to use this feature.</p>}
            </div>
          )}

          <IPProtectionSection
            slug={item.slug}
            email={email}
            contentText={scriptText}
            timestamps={item.timestamps || []}
            isOwner={isOwner}
          />

          <div className="vault-side-section">
            <span className="vault-panel-kicker">Project</span>
            <div className="vault-detail-list">
              <div><span>Created</span><strong>{formatDate(item.created_at)}</strong></div>
              <div><span>Privacy</span><strong>{item.privacy}</strong></div>
              {isOwner && <div><span>Shared</span><strong>{shares.length}</strong></div>}
              {!isOwner && <div><span>Owner</span><strong>{item.owner_email}</strong></div>}
            </div>
          </div>
        </aside>
      </div>

      <VaultAnalysisPanel slug={item.slug} email={email} projectContent={scriptText} role={role} />

      {isOwner && (
        <DraftChatWidget
          slug={item.slug}
          email={email}
          draftText={scriptText}
          contextText={item.workspace_context || ''}
        />
      )}
      </>
      )}
    </div>
  );
}

export function VaultWorkspacePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;
  const [item, setItem] = useState<VaultItem | null>(null);
  const [role, setRole] = useState<VaultRole>('owner');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('draft');
  const [workspaceContent, setWorkspaceContent] = useState('');
  const [workspaceContext, setWorkspaceContext] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collaborator, setCollaborator] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attPreview, setAttPreview] = useState<{ id: number; name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [kek, setKek] = useState<CryptoKey | null>(null);
  const [hasEncryptionKeys, setHasEncryptionKeys] = useState(false);
  const pendingWsItemRef = useRef<(VaultItem & { role: VaultRole }) | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [trackingSnapshot, setTrackingSnapshot] = useTrackingSnapshot(slug, email, !!item && role === 'owner');
  const requestedTab: ProjectTab = searchParams.get('tab') === 'tracking' ? 'tracking' : 'overview';
  const selectTab = useCallback((tab: ProjectTab) => {
    setSearchParams(tab === 'tracking' ? { tab: 'tracking' } : {}, { replace: true });
    if (tab === 'tracking') setTrackingSnapshot(s => (s ? { ...s, newViews: 0 } : s));
  }, [setSearchParams, setTrackingSnapshot]);

  const { reportScroll } = useViewTracking({
    enabled: !!item && role !== 'owner',
    slug: item?.slug,
    viewerEmail: email,
  });

  useEffect(() => {
    fetch(`/api/vault/crypto-keys?email=${encodeURIComponent(email)}`)
      .then(r => { if (r.ok) setHasEncryptionKeys(true); })
      .catch(() => {});
  }, [email]);

  useEffect(() => {
    if (!slug) return;
    let active = true;

    async function load() {
      try {
        const nextItem = await loadVaultItem(slug!, email);
        if (!active) return;
        if (nextItem.item_kind === 'upload') {
          navigate(`/vault/script/${nextItem.slug}`, { replace: true });
          return;
        }

        if (nextItem.is_encrypted) {
          const cachedKek = await getCachedKEK();
          if (cachedKek) {
            setKek(cachedKek);
            const decrypted = await decryptVaultContent(nextItem, cachedKek, email);
            if (!active) return;
            setItem(nextItem);
            setRole(nextItem.role || 'owner');
            setTitle(nextItem.title);
            setStatus(nextItem.status);
            setWorkspaceContent(decrypted);
            setWorkspaceContext(nextItem.workspace_context || '');
            setCollaborators(nextItem.collaborators || []);
            setIsEncrypted(true);
          } else {
            pendingWsItemRef.current = nextItem;
            setNeedsPassword(true);
            setIsEncrypted(true);
            return;
          }
        } else {
          setItem(nextItem);
          setRole(nextItem.role || 'owner');
          setTitle(nextItem.title);
          setStatus(nextItem.status);
          setWorkspaceContent(nextItem.workspace_content || '');
          setWorkspaceContext(nextItem.workspace_context || '');
          setCollaborators(nextItem.collaborators || []);
          setIsEncrypted(false);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load vault item');
      }
    }

    load();
    return () => { active = false; };
  }, [slug, email, navigate]);

  const loadAttachments = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/attachments/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      });
      if (res.ok) setAttachments(await res.json());
    } catch { /* ignore */ }
  }, [slug, email]);

  useEffect(() => {
    if (!slug) return;
    fetch('/api/vault/attachments/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, email }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setAttachments(data); })
      .catch(() => {});
  }, [slug, email]);

  const shares = useMemo(() => item ? parseShares(item.shares) : [], [item]);

  function addCollaborator() {
    const next = collaborator.trim();
    if (!next || collaborators.includes(next)) return;
    setCollaborators([...collaborators, next]);
    setCollaborator('');
  }

  async function handleWsPasswordUnlock(unlockedKek: CryptoKey) {
    setKek(unlockedKek);
    setNeedsPassword(false);
    const pending = pendingWsItemRef.current;
    if (!pending) return;
    try {
      const decrypted = await decryptVaultContent(pending, unlockedKek, email);
      setItem(pending);
      setRole(pending.role || 'owner');
      setTitle(pending.title);
      setStatus(pending.status);
      setWorkspaceContent(decrypted);
      setWorkspaceContext(pending.workspace_context || '');
      setCollaborators(pending.collaborators || []);
    } catch {
      setError('Failed to decrypt content');
    }
    pendingWsItemRef.current = null;
  }

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        slug: item.slug,
        ownerEmail: email,
        title,
        status,
        workspaceContext,
        collaborators,
      };

      if (isEncrypted && kek) {
        const encrypted = await encryptContent(workspaceContent, kek);
        payload.workspaceContent = encrypted.ciphertext;
        payload.isEncrypted = true;
        payload.encryptedDek = encrypted.encryptedDek;
        payload.dekIv = encrypted.dekIv;
        payload.encryptionIv = encrypted.iv;
      } else {
        payload.workspaceContent = workspaceContent;
      }

      const res = await fetch('/api/vault/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save workspace');
      }
      const saved = await res.json();
      setItem(prev => prev ? { ...prev, ...saved } : prev);
      setSavedAt('Saved just now');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workspace');
    } finally {
      setSaving(false);
    }
  }

  async function toggleWsEncryption() {
    if (!hasEncryptionKeys) {
      setError('Set up encryption in Settings first');
      return;
    }
    if (!isEncrypted) {
      const cachedKek = await getCachedKEK();
      if (cachedKek) {
        setKek(cachedKek);
        setIsEncrypted(true);
        setSavedAt('');
      } else {
        setNeedsPassword(true);
      }
    } else {
      setIsEncrypted(false);
      setSavedAt('');
    }
  }

  const handleImportFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!IMPORT_BUTTON_TYPES.includes(`.${ext}`)) {
      setError(`Can only import ${IMPORT_BUTTON_TYPES.join(', ')} files`);
      return;
    }
    setError('');
    try {
      let text: string;
      if (ext === 'pdf') {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await fetch('/api/vault/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: dataUrl }),
        });
        if (!res.ok) throw new Error('extract failed');
        const data = await res.json();
        text = data.text || '';
        if (!text.trim()) {
          setError('No text could be extracted from this PDF');
          return;
        }
      } else {
        text = await readFileAsText(file);
      }
      if (text) {
        setWorkspaceContent(prev => prev ? prev + '\n\n' + text : text);
        setSavedAt('');
      }
    } catch {
      setError('Failed to read file');
    }
  }, []);

  const handleAttachFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ATTACH_TYPES.includes(`.${ext}`)) continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        await fetch('/api/vault/attachments/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug, ownerEmail: email,
            fileName: file.name, fileSize: file.size, fileData: dataUrl,
          }),
        });
      } catch { /* ignore individual failures */ }
    }
    setUploading(false);
    loadAttachments();
  }, [slug, email, loadAttachments]);

  async function handleDeleteAttachment(id: number) {
    await fetch('/api/vault/attachments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ownerEmail: email }),
    });
    loadAttachments();
  }

  const fetchAttachmentBlob = useCallback(async (att: Attachment): Promise<Blob | null> => {
    try {
      const res = await fetch('/api/vault/attachments/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: att.id, email, slug }),
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        if (!data.file_data) return null;
        const inner = await fetch(data.file_data);
        return inner.blob();
      }
      return res.blob();
    } catch {
      return null;
    }
  }, [email, slug]);

  async function handleDownloadAttachment(att: Attachment) {
    const blob = await fetchAttachmentBlob(att);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.file_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function handlePreviewAttachment(att: Attachment) {
    const blob = await fetchAttachmentBlob(att);
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    setAttPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { id: att.id, name: att.file_name, url };
    });
  }

  function closeAttPreview() {
    setAttPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function handleAttachmentClick(att: Attachment) {
    if (isPdfAttachment(att)) handlePreviewAttachment(att);
    else handleDownloadAttachment(att);
  }

  const handleEditorDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragOver(true);
  }, []);

  const handleEditorDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const handleEditorDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files.length) return;

    const textFiles: File[] = [];
    const attachFiles: File[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (IMPORT_TYPES.includes(`.${ext}`)) textFiles.push(file);
      else if (ATTACH_TYPES.includes(`.${ext}`)) attachFiles.push(file);
    }

    if (textFiles.length === 1 && attachFiles.length === 0) {
      handleImportFile(textFiles[0]);
    } else {
      handleAttachFiles([...textFiles, ...attachFiles]);
    }
  }, [handleImportFile, handleAttachFiles]);

  if (needsPassword) {
    return (
      <>
        {item ? null : <LoadingState />}
        <EncryptionPasswordPrompt
          onUnlock={handleWsPasswordUnlock}
          onCancel={() => { setNeedsPassword(false); if (!item) navigate('/vault'); }}
        />
      </>
    );
  }

  if (error && !item) return <ErrorState message={error} />;
  if (!item) return <LoadingState />;

  const isOwner = role === 'owner';
  const canDownload = role === 'owner' || role === 'downloader';
  const showTracking = isOwner && requestedTab === 'tracking';

  const copyGuard = !isOwner ? {
    onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
    onCut: (e: React.ClipboardEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  } : {};

  return (
    <div className={`vault-work-container${!isOwner ? ' vault-no-copy' : ''}`}>
      <VaultItemHeader
        slug={item.slug}
        title={title}
        status={status}
        type={item.project_type}
        kind={item.item_kind}
        saving={saving}
        savedAt={savedAt}
        role={role}
        onTitleChange={setTitle}
        onStatusChange={setStatus}
        onSave={handleSave}
      />

      {isOwner && (
        <VaultItemTabs
          active={showTracking ? 'tracking' : 'overview'}
          onSelect={selectTab}
          snapshot={trackingSnapshot}
        />
      )}

      {showTracking ? (
        <VaultTrackingPanel slug={item.slug} email={email} isEncrypted={!!item.is_encrypted} />
      ) : (
      <>
      <div
        className="vault-workspace-layout"
        onDragEnter={isOwner ? handleEditorDragEnter : undefined}
        onDragOver={isOwner ? (e) => e.preventDefault() : undefined}
        onDragLeave={isOwner ? handleEditorDragLeave : undefined}
        onDrop={isOwner ? handleEditorDrop : undefined}
        {...copyGuard}
      >
        {dragOver && isOwner && (
          <div className="vault-drop-overlay">
            <div className="vault-drop-overlay-inner">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span>Drop files to import or attach</span>
              <em>Text files import into editor. Other files attach as documents.</em>
            </div>
          </div>
        )}

        <section className="vault-editor-panel">
          <div className="vault-panel-top">
            <div>
              <span className="vault-panel-kicker">Workspace</span>
              <h2>Draft Board</h2>
            </div>
            {isOwner && (
              <div className="vault-editor-actions">
                <input
                  ref={importRef}
                  type="file"
                  hidden
                  accept={IMPORT_BUTTON_TYPES.join(',')}
                  onChange={(e) => { if (e.target.files?.[0]) { handleImportFile(e.target.files[0]); e.target.value = ''; } }}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()} title="Import a text or PDF file into editor">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  Import
                </button>
              </div>
            )}
          </div>
          {attPreview ? (
            <div className="vault-att-preview">
              <div className="vault-att-preview-bar">
                <span className="vault-att-preview-name">{attPreview.name}</span>
                <button className="vault-att-preview-close" onClick={closeAttPreview}>Back to draft</button>
              </div>
              <iframe className="vault-pdf-frame" src={attPreview.url} title={attPreview.name} />
            </div>
          ) : (
            <textarea
              className="vault-workspace-editor"
              value={workspaceContent}
              onChange={(e) => { if (isOwner) setWorkspaceContent(e.target.value); }}
              onScroll={!isOwner ? (e) => {
                const el = e.currentTarget;
                reportScroll(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100);
              } : undefined}
              readOnly={!isOwner}
              spellCheck={false}
              placeholder={isOwner ? "Start writing, paste content, or drag a text file here..." : undefined}
            />
          )}
          {error && <p className="vault-modal-error">{error}</p>}
        </section>

        <aside className="vault-context-panel">
          {isOwner && (
            <DraftAssistantPanel
              slug={item.slug}
              email={email}
              draftText={workspaceContent}
              contextText={workspaceContext}
            />
          )}

          <section className="vault-context-section">
            <div className="vault-panel-top vault-panel-top--compact">
              <div>
                <span className="vault-panel-kicker">Documents</span>
                <h2>Files</h2>
              </div>
              <span className="vault-work-count">{attachments.length}</span>
            </div>
            {isOwner && (
              <div
                className={`vault-attach-zone ${uploading ? 'vault-attach-zone--uploading' : ''}`}
                onClick={() => attachRef.current?.click()}
              >
                <input
                  ref={attachRef}
                  type="file"
                  hidden
                  multiple
                  accept={ATTACH_TYPES.join(',')}
                  onChange={(e) => { if (e.target.files?.length) { handleAttachFiles(e.target.files); e.target.value = ''; } }}
                />
                {uploading ? (
                  <span className="vault-attach-uploading">Uploading...</span>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    <span>Upload or drop files</span>
                  </>
                )}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="vault-attach-list">
                {attachments.map(att => (
                  <div key={att.id} className="vault-attach-item">
                    <span className="vault-attach-icon">{fileIcon(att.file_type)}</span>
                    <div className="vault-attach-info">
                      {canDownload ? (
                        <button className="vault-attach-name" onClick={() => handleAttachmentClick(att)} title={isPdfAttachment(att) ? 'View PDF' : 'Download'}>{att.file_name}</button>
                      ) : (
                        <span className="vault-attach-name" style={{ cursor: 'default' }}>{att.file_name}</span>
                      )}
                      <span className="vault-attach-meta">{formatSize(att.file_size)}</span>
                    </div>
                    {isOwner && (
                      <button className="vault-attach-remove" onClick={() => handleDeleteAttachment(att.id)} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="vault-context-section">
            <div className="vault-panel-top vault-panel-top--compact">
              <div>
                <span className="vault-panel-kicker">Context</span>
                <h2>Project Brief</h2>
              </div>
            </div>
            <textarea
              className="vault-context-textarea"
              value={workspaceContext}
              onChange={(e) => { if (isOwner) setWorkspaceContext(e.target.value); }}
              readOnly={!isOwner}
              placeholder={isOwner ? "Describe the project vision, goals, constraints..." : undefined}
            />
          </section>

          {isOwner && (
            <section className="vault-context-section">
              <div className="vault-panel-top vault-panel-top--compact">
                <div>
                  <span className="vault-panel-kicker">Collaboration</span>
                  <h2>Team</h2>
                </div>
                <span className="vault-work-count">{collaborators.length + shares.length}</span>
              </div>
              <div className="vault-team-list">
                {collaborators.map(person => (
                  <span key={person} className="vault-team-chip">
                    {person}
                    <button onClick={() => setCollaborators(collaborators.filter(existing => existing !== person))}>&times;</button>
                  </span>
                ))}
                {shares.map(share => (
                  <span key={share.shared_with} className="vault-team-chip vault-team-chip--share">{share.shared_with}</span>
                ))}
              </div>
              <div className="vault-team-input-row">
                <input
                  className="vault-modal-input"
                  value={collaborator}
                  placeholder="Email or @handle"
                  onChange={(e) => setCollaborator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCollaborator();
                    }
                  }}
                />
                <button className="vault-collab-add" onClick={addCollaborator} disabled={!collaborator.trim()}>Add</button>
              </div>
            </section>
          )}

          {isOwner && (
            <section className="vault-context-section">
              <span className="vault-panel-kicker">Security</span>
              <button
                className={`vault-encrypt-toggle ${isEncrypted ? 'active' : ''}`}
                onClick={toggleWsEncryption}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {isEncrypted ? 'Encrypted' : 'Encrypt this project'}
              </button>
              {isEncrypted && <p className="vault-encrypt-hint">Content is encrypted before saving. Only you and shared users can read it.</p>}
              {!hasEncryptionKeys && <p className="vault-encrypt-hint">Enable encryption in Settings to use this feature.</p>}
            </section>
          )}

          <IPProtectionSection
            slug={item.slug}
            email={email}
            contentText={workspaceContent}
            timestamps={item.timestamps || []}
            isOwner={isOwner}
          />

          <section className="vault-context-section">
            <span className="vault-panel-kicker">Project</span>
            <div className="vault-detail-list">
              <div><span>Created</span><strong>{formatDate(item.created_at)}</strong></div>
              <div><span>Privacy</span><strong>{item.privacy}</strong></div>
              <div><span>Status</span><strong>{statusLabel(status)}</strong></div>
              {!isOwner && <div><span>Owner</span><strong>{item.owner_email}</strong></div>}
            </div>
          </section>
        </aside>
      </div>

      <VaultAnalysisPanel slug={item.slug} email={email} projectContent={workspaceContent} role={role} hasAttachments={attachments.length > 0} />
      </>
      )}
    </div>
  );
}
