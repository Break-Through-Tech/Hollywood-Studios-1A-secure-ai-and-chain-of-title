import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { upload } from '@vercel/blob/client';

const OWNER_EMAIL = localStorage.getItem('hsi-user-email') || '';
const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt', '.fdx', '.fountain'];

type ProjectType = 'script' | 'treatment' | 'pitch_deck' | 'contract' | 'other';
type Privacy = 'public' | 'private' | 'shared';
type Status = 'draft' | 'in_review' | 'final';
type ItemKind = 'upload' | 'workspace';

const PROJECT_TYPES: { value: ProjectType; label: string; icon: string }[] = [
  { value: 'script', label: 'Script', icon: '🎬' },
  { value: 'treatment', label: 'Treatment', icon: '📋' },
  { value: 'pitch_deck', label: 'Pitch Deck', icon: '📊' },
  { value: 'contract', label: 'Contract', icon: '📑' },
  { value: 'other', label: 'Other', icon: '📂' },
];

const PRIVACY_OPTIONS: { value: Privacy; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'shared', label: 'Shared' },
  { value: 'public', label: 'Public' },
];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'final', label: 'Final' },
];

interface Share { shared_with: string; permission: string }
interface Folder { slug: string; name: string; created_at: string; item_count: number }
interface Script {
  slug: string; title: string; file_name: string; file_type: string;
  file_size: number; created_at: string; shares: Share[] | string;
  project_type: ProjectType; privacy: Privacy; status: Status;
  collaborators: string[]; item_kind: ItemKind; has_timestamp?: boolean;
  is_encrypted?: boolean; folder_slug?: string | null;
}
interface SharedScript {
  slug: string; title: string; file_name: string; file_type: string;
  file_size: number; created_at: string; owner_email: string;
  project_type: ProjectType; privacy: Privacy; status: Status;
  item_kind: ItemKind; my_permission: string;
}

function projectTypeInfo(type: ProjectType) {
  return PROJECT_TYPES.find(t => t.value === type) || PROJECT_TYPES[4];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function parseShares(shares: Share[] | string): Share[] {
  if (typeof shares === 'string') {
    try { return JSON.parse(shares); } catch { return []; }
  }
  return shares || [];
}

function PrivacyIcon({ privacy }: { privacy: Privacy }) {
  if (privacy === 'public') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
  if (privacy === 'shared') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

type ViewTab = 'recent' | 'board' | 'ideas';

export function VaultPage() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [sharedScripts, setSharedScripts] = useState<SharedScript[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [shareTarget, setShareTarget] = useState<Script | null>(null);
  const [moveTarget, setMoveTarget] = useState<Script | null>(null);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('recent');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const email = localStorage.getItem('hsi-user-email') || OWNER_EMAIL;

  async function loadScripts() {
    try {
      const res = await fetch('/api/vault/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setScripts(data);
          setSharedScripts([]);
        } else {
          setScripts(data.owned || []);
          setSharedScripts(data.shared || []);
          setFolders(data.folders || []);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => {
    loadScripts();
  }, [email]);

  async function handleDelete(slug: string) {
    if (!confirm('Delete this project permanently?')) return;
    await fetch('/api/vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ownerEmail: email }),
    });
    setMenuOpen(null);
    loadScripts();
  }

  async function handleMove(slug: string, folderSlug: string | null) {
    const res = await fetch('/api/vault/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerEmail: email, slug, folderSlug }),
    });
    if (res.ok) {
      setScripts(prev => prev.map(s => s.slug === slug ? { ...s, folder_slug: folderSlug } : s));
      setFolders(prev => prev.map(f => ({
        ...f,
        item_count: f.slug === folderSlug
          ? f.item_count + 1
          : scripts.find(s => s.slug === slug)?.folder_slug === f.slug ? Math.max(0, f.item_count - 1) : f.item_count,
      })));
    }
    setMoveTarget(null);
  }

  async function handleDeleteFolder(folder: Folder) {
    const msg = folder.item_count > 0
      ? `Delete "${folder.name}"? Its ${folder.item_count} item${folder.item_count === 1 ? '' : 's'} will move back to the vault.`
      : `Delete "${folder.name}"?`;
    if (!confirm(msg)) return;
    await fetch('/api/vault/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerEmail: email, slug: folder.slug }),
    });
    setFolderMenuOpen(null);
    if (currentFolder === folder.slug) setCurrentFolder(null);
    loadScripts();
  }

  function openVaultItem(script: Script) {
    const path = script.item_kind === 'workspace' ? 'workspace' : 'script';
    navigate(`/vault/${path}/${script.slug}`);
  }

  const inFolder = scripts.filter(s => (s.folder_slug || null) === currentFolder);
  const displayed = activeTab === 'recent'
    ? [...inFolder].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : inFolder;
  const activeFolder = folders.find(f => f.slug === currentFolder) || null;

  return (
    <div className="vault-page">
      <div className="vault-container">
        <header className="vault-header">
          {activeFolder ? (
            <div className="vault-breadcrumb">
              <button className="vault-breadcrumb-link" onClick={() => setCurrentFolder(null)}>Creative OS</button>
              <span className="vault-breadcrumb-sep">/</span>
              <h1 className="vault-title">{activeFolder.name}</h1>
            </div>
          ) : (
            <h1 className="vault-title">Creative OS</h1>
          )}
          <div className="vault-header-actions">
            {!activeFolder && (
              <button className="btn btn-secondary" onClick={() => setShowCreateFolder(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                New Folder
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              New
            </button>
          </div>
        </header>

        <div className="vault-tabs">
          <button className={`vault-tab ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            Recent
          </button>
          <button className={`vault-tab ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            Board
          </button>
          <button className={`vault-tab ${activeTab === 'ideas' ? 'active' : ''}`} onClick={() => setActiveTab('ideas')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            Ideas
          </button>
        </div>

        {loading ? (
          <div className="vault-empty">Loading...</div>
        ) : displayed.length === 0 && (activeFolder || folders.length === 0) ? (
          <div className="vault-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <p>{activeFolder ? 'This folder is empty' : 'No projects yet'}</p>
            {!activeFolder && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first project</button>}
          </div>
        ) : (
          <div className="vault-grid">
            {!activeFolder && folders.map((f) => (
              <div
                key={`folder-${f.slug}`}
                className={`vault-card vault-folder-card${dragOverFolder === f.slug ? ' vault-folder-card--dragover' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setCurrentFolder(f.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCurrentFolder(f.slug);
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.slug); }}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolder(null);
                  const slug = e.dataTransfer.getData('vault-item-slug');
                  if (slug) handleMove(slug, f.slug);
                }}
              >
                <div className="vault-card-thumb vault-folder-thumb">
                  <svg className="vault-folder-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                </div>
                <div className="vault-card-info">
                  <div className="vault-card-text">
                    <h3 className="vault-card-title">{f.name}</h3>
                    <div className="vault-card-meta">
                      <span className="vault-card-time">{f.item_count} item{f.item_count === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div className="vault-card-menu-wrap">
                    <button className="vault-card-dots" onClick={(e) => { e.stopPropagation(); setFolderMenuOpen(folderMenuOpen === f.slug ? null : f.slug); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                    </button>
                    {folderMenuOpen === f.slug && (
                      <div className="vault-dropdown" onClick={(e) => e.stopPropagation()}>
                        <button className="vault-dropdown-item" onClick={() => { setRenameTarget(f); setFolderMenuOpen(null); }}>Rename</button>
                        <button className="vault-dropdown-item vault-dropdown-item--danger" onClick={() => handleDeleteFolder(f)}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {displayed.map((s) => {
              const typeInfo = projectTypeInfo(s.project_type);
              const shares = parseShares(s.shares);
              const collabCount = (s.collaborators?.length || 0) + shares.length;
              return (
                <div
                  key={s.slug}
                  className="vault-card"
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('vault-item-slug', s.slug); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => openVaultItem(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openVaultItem(s);
                    }
                  }}
                >
                  <div className="vault-card-thumb">
                    <div className="vault-card-thumb-top">
                      <span className={`vault-card-privacy vault-card-privacy--${s.privacy}`}>
                        <PrivacyIcon privacy={s.privacy} />
                        {s.privacy}
                      </span>
                      {s.is_encrypted && (
                        <span className="vault-card-encrypted" title="Encrypted">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        </span>
                      )}
                      {s.has_timestamp && (
                        <span className="vault-card-timestamp" title="Blockchain verified">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        </span>
                      )}
                      {collabCount > 0 && (
                        <span className="vault-card-collabs">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                          {collabCount}
                        </span>
                      )}
                    </div>
                    <div className="vault-card-page" aria-hidden="true"><span>{s.title}</span></div>
                  </div>
                  <div className="vault-card-info">
                    <div className="vault-card-text">
                      <h3 className="vault-card-title">{s.title}</h3>
                      <div className="vault-card-meta">
                        <span className="vault-card-time">{timeAgo(s.created_at)}</span>
                      </div>
                    </div>
                    <div className="vault-card-badges">
                      <span className={`vault-badge vault-badge--type`}>{typeInfo.label}</span>
                      <span className={`vault-badge vault-badge--status vault-badge--${s.status}`}>
                        {s.status === 'in_review' ? 'In Review' : s.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </div>
                    <div className="vault-card-menu-wrap">
                      <button className="vault-card-dots" onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === s.slug ? null : s.slug); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                      </button>
                      {menuOpen === s.slug && (
                        <div className="vault-dropdown" onClick={(e) => e.stopPropagation()}>
                          <button className="vault-dropdown-item" onClick={() => { setShareTarget(s); setMenuOpen(null); }}>Share</button>
                          <button className="vault-dropdown-item" onClick={() => { setMoveTarget(s); setMenuOpen(null); }}>Move to...</button>
                          <button className="vault-dropdown-item vault-dropdown-item--danger" onClick={() => handleDelete(s.slug)}>Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!activeFolder && sharedScripts.length > 0 && (
        <div className="vault-container vault-container--shared">
          <h2 className="vault-subheading">Shared with me</h2>
          <div className="vault-grid">
            {sharedScripts.map((s) => {
              const typeInfo = projectTypeInfo(s.project_type);
              return (
                <div
                  key={`shared-${s.slug}`}
                  className="vault-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const path = s.item_kind === 'workspace' ? 'workspace' : 'script';
                    navigate(`/vault/${path}/${s.slug}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const path = s.item_kind === 'workspace' ? 'workspace' : 'script';
                      navigate(`/vault/${path}/${s.slug}`);
                    }
                  }}
                >
                  <div className="vault-card-thumb">
                    <div className="vault-card-thumb-top">
                      <span className="vault-card-privacy vault-card-privacy--shared">
                        <PrivacyIcon privacy="shared" />
                        {s.my_permission}
                      </span>
                    </div>
                    <div className="vault-card-page" aria-hidden="true"><span>{s.title}</span></div>
                  </div>
                  <div className="vault-card-info">
                    <div className="vault-card-text">
                      <h3 className="vault-card-title">{s.title}</h3>
                      <div className="vault-card-meta">
                        <span className="vault-card-time">{s.owner_email}</span>
                      </div>
                    </div>
                    <div className="vault-card-badges">
                      <span className="vault-badge vault-badge--type">{typeInfo.label}</span>
                      <span className={`vault-badge vault-badge--status vault-badge--${s.status}`}>
                        {s.status === 'in_review' ? 'In Review' : s.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && <CreateProjectModal email={email} folderSlug={currentFolder} onClose={() => setShowCreate(false)} onCreated={loadScripts} />}
      {shareTarget && <ShareModal email={email} script={shareTarget} onClose={() => setShareTarget(null)} onShared={loadScripts} />}
      {showCreateFolder && <FolderNameModal title="New Folder" email={email} onClose={() => setShowCreateFolder(false)} onDone={loadScripts} />}
      {renameTarget && <FolderNameModal title="Rename Folder" email={email} folder={renameTarget} onClose={() => setRenameTarget(null)} onDone={loadScripts} />}
      {moveTarget && (
        <MoveModal
          script={moveTarget}
          folders={folders}
          onClose={() => setMoveTarget(null)}
          onMove={(folderSlug) => handleMove(moveTarget.slug, folderSlug)}
        />
      )}
    </div>
  );
}

function FolderNameModal({ title, email, folder, onClose, onDone }: {
  title: string; email: string; folder?: Folder; onClose: () => void; onDone: () => void;
}) {
  const [name, setName] = useState(folder?.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim()) { setError('Please enter a folder name.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const url = folder ? '/api/vault/folders/rename' : '/api/vault/folders/create';
      const body = folder
        ? { ownerEmail: email, slug: folder.slug, name: name.trim() }
        : { ownerEmail: email, name: name.trim() };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to save folder');
        setSubmitting(false);
        return;
      }
      onDone();
      onClose();
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal">
        <h2 className="vault-modal-title">{title}</h2>
        <div className="vault-modal-field">
          <input
            type="text"
            className="vault-modal-input"
            placeholder="Folder name"
            value={name}
            autoFocus
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
          />
        </div>
        {error && <p className="vault-modal-error">{error}</p>}
        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : folder ? 'Rename' : 'Create Folder'}
          </button>
        </div>
      </div>
    </>
  );
}

function MoveModal({ script, folders, onClose, onMove }: {
  script: Script; folders: Folder[]; onClose: () => void; onMove: (folderSlug: string | null) => void;
}) {
  const current = script.folder_slug || null;
  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal">
        <h2 className="vault-modal-title">Move "{script.title}"</h2>
        <div className="vault-move-list">
          <button
            className={`vault-move-option${current === null ? ' vault-move-option--current' : ''}`}
            disabled={current === null}
            onClick={() => onMove(null)}
          >
            <span className="vault-move-icon">🗂️</span>
            Creative OS
            {current === null && <span className="vault-move-current-label">Current</span>}
          </button>
          {folders.map(f => (
            <button
              key={f.slug}
              className={`vault-move-option${current === f.slug ? ' vault-move-option--current' : ''}`}
              disabled={current === f.slug}
              onClick={() => onMove(f.slug)}
            >
              <span className="vault-move-icon">📁</span>
              {f.name}
              {current === f.slug && <span className="vault-move-current-label">Current</span>}
            </button>
          ))}
          {folders.length === 0 && (
            <p className="vault-modal-hint">No folders yet. Create one from the Creative OS page first.</p>
          )}
        </div>
        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

type CreatePath = null | 'upload' | 'workspace';

function CreateProjectModal({ email, folderSlug, onClose, onCreated }: { email: string; folderSlug: string | null; onClose: () => void; onCreated: () => void }) {
  const [path, setPath] = useState<CreatePath>(null);
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('script');
  const [privacy, setPrivacy] = useState<Privacy>('private');
  const [status, setStatus] = useState<Status>('draft');
  const [collaborator, setCollaborator] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addCollaborator() {
    const val = collaborator.trim();
    if (val && !collaborators.includes(val)) {
      setCollaborators([...collaborators, val]);
      setCollaborator('');
    }
  }

  function removeCollaborator(c: string) {
    setCollaborators(collaborators.filter(x => x !== c));
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Please enter a project title.'); return; }
    if (path === 'upload' && !file) { setError('Please select a file to upload.'); return; }
    setSubmitting(true);
    setError('');

    try {
      if (path === 'upload' && file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!ACCEPTED_TYPES.includes(`.${ext}`)) {
          setError(`Unsupported file type. Accepted: ${ACCEPTED_TYPES.join(', ')}`);
          setSubmitting(false);
          return;
        }
        // Bytes go straight to Blob storage; the request that creates the
        // project carries only the URL, so file size is not bound by the body limit.
        try {
          const blob = await upload(`vault/uploads/${Date.now()}-${file.name}`, file, {
            access: 'private', handleUploadUrl: '/api/vault/upload-token',
          });
          const res = await fetch('/api/vault/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerEmail: email, title: title.trim(),
              fileName: file.name, fileType: ext, fileSize: file.size,
              blobUrl: blob.url,
              projectType, privacy, status, collaborators, folderSlug,
            }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || (res.status === 413 ? 'That file is too large to upload.' : 'Upload failed')); return; }
          onCreated(); onClose();
        } catch (err) {
          setError(err instanceof Error && err.message ? `Upload failed: ${err.message}` : 'Network error. Please try again.');
        } finally { setSubmitting(false); }
      } else {
        const res = await fetch('/api/vault/create-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerEmail: email, title: title.trim(),
            projectType, privacy, status, collaborators, folderSlug,
          }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Failed to create workspace'); setSubmitting(false); return; }
        onCreated(); onClose();
      }
    } catch { setError('Network error. Please try again.'); setSubmitting(false); }
  }

  if (!path) {
    return (
      <>
        <div className="vault-overlay" onClick={onClose} />
        <div className="vault-modal vault-modal--wide">
          <h2 className="vault-modal-title">Create New Project</h2>
          <p className="vault-modal-hint">Choose how you'd like to start.</p>
          <div className="vault-path-chooser">
            <button className="vault-path-card" onClick={() => setPath('upload')}>
              <div className="vault-path-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h3>Upload Project</h3>
              <p>Import an existing file from your device</p>
              <span className="vault-path-formats">PDF, DOCX, TXT, FDX, Fountain</span>
            </button>
            <button className="vault-path-card" onClick={() => setPath('workspace')}>
              <div className="vault-path-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <h3>New Workspace</h3>
              <p>Start a blank project in the Creative OS</p>
              <span className="vault-path-formats">Collaborate and build from scratch</span>
            </button>
          </div>
          <div className="vault-modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal vault-modal--wide">
        <div className="vault-modal-top">
          <button className="vault-modal-back" onClick={() => setPath(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="vault-modal-title">
            {path === 'upload' ? 'Upload Project' : 'New Workspace'}
          </h2>
        </div>

        <div className="vault-modal-field">
          <label className="vault-label">Project Title</label>
          <input type="text" className="vault-modal-input" placeholder="Enter project title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="vault-modal-field">
          <label className="vault-label">Project Type</label>
          <div className="vault-selector-pills">
            {PROJECT_TYPES.map(t => (
              <button key={t.value} className={`vault-selector-pill ${projectType === t.value ? 'active' : ''}`} onClick={() => setProjectType(t.value)}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="vault-modal-row">
          <div className="vault-modal-field vault-modal-field--half">
            <label className="vault-label">Privacy</label>
            <div className="vault-selector-pills">
              {PRIVACY_OPTIONS.map(p => (
                <button key={p.value} className={`vault-selector-pill ${privacy === p.value ? 'active' : ''}`} onClick={() => setPrivacy(p.value)}>
                  <PrivacyIcon privacy={p.value} /> {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="vault-modal-field vault-modal-field--half">
            <label className="vault-label">Status</label>
            <div className="vault-selector-pills">
              {STATUS_OPTIONS.map(st => (
                <button key={st.value} className={`vault-selector-pill ${status === st.value ? 'active' : ''}`} onClick={() => setStatus(st.value)}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="vault-modal-field">
          <label className="vault-label">Collaborators</label>
          <div className="vault-collab-input-row">
            <input type="text" className="vault-modal-input" placeholder="Email or @handle" value={collaborator}
              onChange={(e) => setCollaborator(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCollaborator(); } }}
            />
            <button className="vault-collab-add" onClick={addCollaborator} disabled={!collaborator.trim()}>Add</button>
          </div>
          {collaborators.length > 0 && (
            <div className="vault-collab-chips">
              {collaborators.map(c => (
                <span key={c} className="vault-collab-chip">
                  {c}
                  <button className="vault-collab-remove" onClick={() => removeCollaborator(c)}>&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {path === 'upload' && (
          <div className="vault-modal-field">
            <label className="vault-label">File</label>
            <div
              className={`vault-dropzone ${file ? 'has-file' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
            >
              <input ref={inputRef} type="file" hidden accept={ACCEPTED_TYPES.join(',')} onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
              {file ? (
                <div className="vault-dropzone-file">
                  <span className="vault-dropzone-name">{file.name}</span>
                  <span className="vault-dropzone-size">{formatSize(file.size)}</span>
                </div>
              ) : (
                <>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                  <p>Drop a file here or click to browse</p>
                </>
              )}
            </div>
          </div>
        )}

        {error && <p className="vault-modal-error">{error}</p>}

        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </>
  );
}

function ShareModal({ email, script, onClose, onShared }: { email: string; script: Script; onClose: () => void; onShared: () => void }) {
  const [toEmail, setToEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'download'>('view');
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const shares = parseShares(script.shares);

  const shareUrl = `${window.location.origin}/vault/${script.item_kind === 'workspace' ? 'workspace' : 'script'}/${script.slug}`;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!toEmail.trim()) { setError('Enter an email or handle.'); return; }
    setSharing(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/vault/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: script.slug, ownerEmail: email, sharedWith: toEmail.trim(), permission }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return; }
      setSuccess(`Shared with ${toEmail.trim()}`);
      setToEmail('');
      onShared();
    } catch { setError('Network error'); } finally { setSharing(false); }
  }

  async function handleUnshare(sharedWith: string) {
    setRemoving(sharedWith);
    setError('');
    try {
      const res = await fetch('/api/vault/unshare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: script.slug, ownerEmail: email, sharedWith }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Failed to remove'); return; }
      setSuccess(`Removed ${sharedWith}`);
      onShared();
    } catch { setError('Network error'); } finally { setRemoving(null); }
  }

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal">
        <h2 className="vault-modal-title">Share "{script.title}"</h2>
        <div className="vault-copy-link-row">
          <div className="vault-copy-link-url">{shareUrl}</div>
          <button className={`vault-copy-link-btn${copied ? ' vault-copy-link-btn--copied' : ''}`} onClick={handleCopyLink}>
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                Copy link
              </>
            )}
          </button>
        </div>
        <p className="vault-copy-link-hint">Only people you've shared with can open this link</p>
        {shares.length > 0 && (
          <div className="vault-share-list">
            {shares.map((s, i) => (
              <div key={i} className="vault-share-row">
                <span className="vault-share-who">{s.shared_with}</span>
                <span className="vault-share-badge">{s.permission}</span>
                <button
                  className="vault-share-remove"
                  onClick={() => handleUnshare(s.shared_with)}
                  disabled={removing === s.shared_with}
                  title="Remove access"
                >
                  {removing === s.shared_with ? '...' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="vault-modal-field">
          <input type="text" className="vault-modal-input" placeholder="Email or @handle" value={toEmail} onChange={(e) => { setToEmail(e.target.value); setError(''); setSuccess(''); }} />
        </div>
        <div className="vault-permission-toggle">
          <button className={`vault-perm-btn ${permission === 'view' ? 'active' : ''}`} onClick={() => setPermission('view')}>View only</button>
          <button className={`vault-perm-btn ${permission === 'download' ? 'active' : ''}`} onClick={() => setPermission('download')}>Download</button>
        </div>
        {error && <p className="vault-modal-error">{error}</p>}
        {success && <p className="vault-modal-success">{success}</p>}
        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
          <button className="btn btn-primary" onClick={handleShare} disabled={sharing}>
            {sharing ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </div>
    </>
  );
}
