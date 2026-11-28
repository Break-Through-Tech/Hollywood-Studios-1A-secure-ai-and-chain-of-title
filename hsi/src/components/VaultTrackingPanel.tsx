import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ShareLink {
  id: number;
  token: string;
  label: string | null;
  require_email: boolean;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  max_visits: number | null;
  visit_count: number | null;
  allowed_emails: string[] | null;
  allow_download: boolean;
  notify_on_view: boolean;
  nda_text: string | null;
  watermark_enabled: boolean;
  verify_email: boolean;
  has_passcode: boolean;
}

interface ViewSession {
  id: number;
  session_key: string;
  link_id: number | null;
  viewer_email: string | null;
  viewer_name: string | null;
  duration_seconds: number;
  max_scroll_pct: number;
  pages_viewed: number;
  total_pages: number;
  page_times: Record<string, number> | null;
  started_at: string;
  last_active_at: string;
  ip_country: string | null;
  ip_city: string | null;
  ip_region: string | null;
  version_number: number | null;
  download_count: number | null;
  link_label: string | null;
}

interface ViewNote {
  id: number;
  session_id: number | null;
  author_email: string | null;
  kind: 'viewer' | 'owner';
  target_email: string | null;
  content: string;
  created_at: string;
}

interface Signature {
  id: number;
  link_id: number | null;
  signer_name: string;
  signer_email: string | null;
  ip_address: string | null;
  agreement_hash: string;
  signed_at: string;
  link_label: string | null;
}

interface ScriptVersion {
  id: number;
  version_number: number;
  content_hash: string | null;
  note: string | null;
  created_at: string;
}

interface ViewerGroup {
  key: string;
  label: string;
  email: string | null;
  sessions: ViewSession[];
  totalSeconds: number;
  maxReadPct: number;
  maxPages: number;
  totalPages: number;
  lastViewed: string;
}

interface LinkDraft {
  label: string;
  requireEmail: boolean;
  expiresAt: string;
  maxVisits: string;
  passcode: string;
  clearPasscode: boolean;
  allowedEmails: string;
  allowDownload: boolean;
  notifyOnView: boolean;
  watermarkEnabled: boolean;
  verifyEmail: boolean;
  ndaText: string;
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

function readPct(s: ViewSession) {
  if (s.total_pages > 0) return Math.round((s.pages_viewed / s.total_pages) * 100);
  return s.max_scroll_pct;
}

function engagementScore(g: ViewerGroup) {
  const completion = g.totalPages > 0 ? g.maxPages / g.totalPages : g.maxReadPct / 100;
  const time = Math.min(g.totalSeconds / 300, 1);
  const revisit = Math.min(g.sessions.length / 3, 1);
  return Math.round((completion * 0.5 + time * 0.3 + revisit * 0.2) * 100);
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function geoLabel(s: ViewSession): string | null {
  if (s.ip_city && s.ip_country) return `${s.ip_city}, ${s.ip_country}`;
  return s.ip_country || null;
}

function draftFromLink(link: ShareLink): LinkDraft {
  return {
    label: link.label || '',
    requireEmail: link.require_email,
    expiresAt: toLocalInput(link.expires_at),
    maxVisits: link.max_visits ? String(link.max_visits) : '',
    passcode: '',
    clearPasscode: false,
    allowedEmails: (link.allowed_emails || []).join(', '),
    allowDownload: link.allow_download,
    notifyOnView: link.notify_on_view,
    watermarkEnabled: link.watermark_enabled,
    verifyEmail: link.verify_email,
    ndaText: link.nda_text || '',
  };
}

function PageTimeline({ pageTimes, totalPages }: { pageTimes: Record<string, number> | null; totalPages: number }) {
  if (!pageTimes || totalPages <= 0) return null;
  const max = Math.max(1, ...Object.values(pageTimes));
  const bars = Array.from({ length: Math.min(totalPages, 120) }, (_, i) => {
    const t = pageTimes[String(i)] || 0;
    return { i, t, h: t > 0 ? Math.max(0.15, t / max) : 0 };
  });
  return (
    <div className="vault-tracking-timeline" title="Time spent per page">
      {bars.map(b => (
        <div key={b.i} className="vault-tracking-timeline-col" title={`Page ${b.i + 1}: ${formatDuration(b.t)}`}>
          <div
            className={`vault-tracking-timeline-bar ${b.t === 0 ? 'vault-tracking-timeline-bar--empty' : ''}`}
            style={{ height: `${Math.round(b.h * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function VaultTrackingPanel({ slug, email, isEncrypted }: { slug: string; email: string; isEncrypted: boolean }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [sessions, setSessions] = useState<ViewSession[]>([]);
  const [notes, setNotes] = useState<ViewNote[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [requireEmail, setRequireEmail] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<number | null>(null);
  const [draft, setDraft] = useState<LinkDraft | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [versionFilter, setVersionFilter] = useState<'all' | number>('all');
  const [ownerNoteDrafts, setOwnerNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [error, setError] = useState('');

  const lastSeenRef = useRef<number>(0);
  useEffect(() => {
    const stored = localStorage.getItem(`hsi-tracking-seen-${slug}`);
    lastSeenRef.current = stored ? Number(stored) || 0 : 0;
  }, [slug]);

  const loadAll = useCallback(() => {
    const post = (path: string) => fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ownerEmail: email }),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    return Promise.all([
      post('/api/vault/tracking/list-links'),
      post('/api/vault/tracking/summary'),
      post('/api/vault/tracking/signatures'),
      post('/api/vault/tracking/versions'),
    ])
      .then(([linksData, summaryData, sigData, verData]) => {
        if (linksData) setLinks(linksData.links || []);
        if (summaryData) {
          setSessions(summaryData.sessions || []);
          setNotes(summaryData.notes || []);
          const latest = (summaryData.sessions || []).reduce((acc: number, s: ViewSession) => Math.max(acc, new Date(s.started_at).getTime()), 0);
          if (latest > 0) localStorage.setItem(`hsi-tracking-seen-${slug}`, String(latest));
        }
        if (sigData) setSignatures(sigData.signatures || []);
        if (verData) {
          setVersions(verData.versions || []);
          setCurrentVersion(verData.currentVersion || 1);
        }
      })
      .finally(() => setLoading(false));
  }, [slug, email]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const newViews = useMemo(
    () => sessions.filter(s => new Date(s.started_at).getTime() > lastSeenRef.current).length,
    [sessions],
  );

  const filteredSessions = useMemo(
    () => versionFilter === 'all' ? sessions : sessions.filter(s => (s.version_number || 1) === versionFilter),
    [sessions, versionFilter],
  );

  const viewers = useMemo<ViewerGroup[]>(() => {
    const groups = new Map<string, ViewerGroup>();
    for (const s of filteredSessions) {
      const key = s.viewer_email || `anon-${s.link_id ?? 'x'}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          label: s.viewer_name
            ? `${s.viewer_name} (${s.viewer_email || 'no email'})`
            : s.viewer_email || `Anonymous viewer${s.link_label ? ` · ${s.link_label}` : ''}`,
          email: s.viewer_email,
          sessions: [],
          totalSeconds: 0,
          maxReadPct: 0,
          maxPages: 0,
          totalPages: 0,
          lastViewed: s.started_at,
        };
        groups.set(key, g);
      }
      g.sessions.push(s);
      g.totalSeconds += s.duration_seconds;
      g.maxReadPct = Math.max(g.maxReadPct, readPct(s));
      g.maxPages = Math.max(g.maxPages, s.pages_viewed);
      g.totalPages = Math.max(g.totalPages, s.total_pages);
      if (new Date(s.last_active_at) > new Date(g.lastViewed)) g.lastViewed = s.last_active_at;
    }
    return Array.from(groups.values()).sort((a, b) => new Date(b.lastViewed).getTime() - new Date(a.lastViewed).getTime());
  }, [filteredSessions]);

  const stats = useMemo(() => {
    const visits = filteredSessions.length;
    const uniqueViewers = new Set(filteredSessions.map(s => s.viewer_email || `anon-${s.link_id ?? 'x'}`)).size;
    const totalSeconds = filteredSessions.reduce((acc, s) => acc + s.duration_seconds, 0);
    const avgSeconds = visits > 0 ? Math.round(totalSeconds / visits) : 0;
    const avgCompletion = visits > 0
      ? Math.round(filteredSessions.reduce((acc, s) => acc + readPct(s), 0) / visits)
      : 0;
    const downloads = filteredSessions.reduce((acc, s) => acc + (s.download_count || 0), 0);
    const lastViewed = filteredSessions.reduce<string | null>(
      (acc, s) => (!acc || new Date(s.started_at) > new Date(acc) ? s.started_at : acc),
      null,
    );
    return { visits, uniqueViewers, totalSeconds, avgSeconds, avgCompletion, downloads, lastViewed };
  }, [filteredSessions]);

  const activity = useMemo(() => {
    const DAYS = 30;
    const dayMs = 86_400_000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - (DAYS - 1) * dayMs;
    const buckets = Array.from({ length: DAYS }, (_, i) => ({ ts: start + i * dayMs, count: 0 }));
    for (const s of filteredSessions) {
      const d = new Date(s.started_at);
      d.setHours(0, 0, 0, 0);
      const idx = Math.round((d.getTime() - start) / dayMs);
      if (idx >= 0 && idx < DAYS) buckets[idx].count += 1;
    }
    const max = Math.max(...buckets.map(b => b.count));
    return max > 0 ? { buckets, max } : null;
  }, [filteredSessions]);

  const dropoff = useMemo(() => {
    const paged = filteredSessions.filter(s => s.total_pages > 0 && s.page_times);
    if (paged.length < 2) return null;
    const totalPages = Math.min(Math.max(...paged.map(s => s.total_pages)), 120);
    const pages = Array.from({ length: totalPages }, (_, i) => {
      let reached = 0;
      let time = 0;
      for (const s of paged) {
        const t = s.page_times?.[String(i)];
        if (t !== undefined && t > 0) { reached += 1; time += t; }
      }
      return {
        i,
        reachedPct: Math.round((reached / paged.length) * 100),
        avgSeconds: reached > 0 ? Math.round(time / reached) : 0,
      };
    });
    return { pages, sessionCount: paged.length };
  }, [filteredSessions]);

  const viewerNotesFor = useCallback((g: ViewerGroup) => {
    const sessionIds = new Set(g.sessions.map(s => s.id));
    return notes.filter(n => n.kind === 'viewer' && (
      (n.session_id !== null && sessionIds.has(n.session_id)) ||
      (g.email && n.author_email === g.email)
    ));
  }, [notes]);

  const ownerNotesFor = useCallback((g: ViewerGroup) => {
    return notes.filter(n => n.kind === 'owner' && n.target_email && n.target_email === (g.email || g.key));
  }, [notes]);

  async function handleCreateLink() {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/vault/tracking/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email, label: newLabel.trim() || null, requireEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to create link');
      } else {
        setLinks(prev => [data.link, ...prev]);
        setNewLabel('');
      }
    } catch { setError('Network error'); }
    setCreating(false);
  }

  async function handleToggleLink(link: ShareLink) {
    const res = await fetch('/api/vault/tracking/update-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: link.id, ownerEmail: email, isActive: !link.is_active }),
    });
    if (res.ok) {
      const data = await res.json();
      setLinks(prev => prev.map(l => l.id === link.id ? data.link : l));
    }
  }

  async function handleDeactivateAll() {
    if (!window.confirm('Deactivate every trackable link for this project? Viewers with those links will lose access.')) return;
    const res = await fetch('/api/vault/tracking/deactivate-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ownerEmail: email }),
    });
    if (res.ok) setLinks(prev => prev.map(l => ({ ...l, is_active: false })));
  }

  function openEditor(link: ShareLink) {
    if (editingLink === link.id) {
      setEditingLink(null);
      setDraft(null);
      return;
    }
    setEditingLink(link.id);
    setDraft(draftFromLink(link));
    setLinkError('');
  }

  async function handleSaveLink(link: ShareLink) {
    if (!draft) return;
    setSavingLink(true);
    setLinkError('');
    const maxVisitsNum = parseInt(draft.maxVisits, 10);
    const body: Record<string, unknown> = {
      linkId: link.id,
      ownerEmail: email,
      label: draft.label.trim(),
      requireEmail: draft.requireEmail,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : '',
      maxVisits: Number.isFinite(maxVisitsNum) && maxVisitsNum > 0 ? maxVisitsNum : null,
      allowedEmails: draft.allowedEmails.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
      allowDownload: draft.allowDownload,
      notifyOnView: draft.notifyOnView,
      watermarkEnabled: draft.watermarkEnabled,
      verifyEmail: draft.verifyEmail,
      ndaText: draft.ndaText,
    };
    if (draft.clearPasscode) body.passcode = '';
    else if (draft.passcode.trim()) body.passcode = draft.passcode.trim();
    try {
      const res = await fetch('/api/vault/tracking/update-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinkError(data.error || 'Failed to save link settings');
      } else {
        setLinks(prev => prev.map(l => l.id === link.id ? data.link : l));
        setEditingLink(null);
        setDraft(null);
      }
    } catch { setLinkError('Network error'); }
    setSavingLink(false);
  }

  function handleCopy(link: ShareLink) {
    navigator.clipboard.writeText(`${window.location.origin}/view/${link.token}`).then(() => {
      setCopied(link.id);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

  function handleExportSignatures() {
    const esc = (v: string | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Signed at', 'Name', 'Email', 'Link', 'IP address', 'Agreement hash'].join(','),
      ...signatures.map(s => [
        esc(new Date(s.signed_at).toISOString()), esc(s.signer_name), esc(s.signer_email),
        esc(s.link_label), esc(s.ip_address), esc(s.agreement_hash),
      ].join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-signatures.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddOwnerNote(g: ViewerGroup) {
    const draftNote = (ownerNoteDrafts[g.key] || '').trim();
    if (!draftNote) return;
    setSavingNote(g.key);
    try {
      const res = await fetch('/api/vault/tracking/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ownerEmail: email, targetEmail: g.email || g.key, content: draftNote }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => [data.note, ...prev]);
        setOwnerNoteDrafts(prev => ({ ...prev, [g.key]: '' }));
      }
    } catch { /* ignore */ }
    setSavingNote(null);
  }

  function linkGates(link: ShareLink): string {
    const parts: string[] = [];
    parts.push(link.require_email ? 'Email gate' : 'Open access');
    if (link.has_passcode) parts.push('Passcode');
    if ((link.allowed_emails || []).length > 0) parts.push('Allowlist');
    if (link.nda_text) parts.push('NDA');
    if (link.expires_at) {
      const expired = new Date(link.expires_at).getTime() < Date.now();
      parts.push(expired ? 'Expired' : `Expires ${formatWhen(link.expires_at)}`);
    }
    if (link.max_visits) parts.push(`${link.visit_count || 0}/${link.max_visits} visits`);
    else if (link.visit_count) parts.push(`${link.visit_count} visit${link.visit_count === 1 ? '' : 's'}`);
    if (!link.is_active) parts.push('Deactivated');
    return parts.join(' · ');
  }

  const anyActive = links.some(l => l.is_active);

  return (
    <section className="vault-tracking-panel">
      <div className="vault-panel-top">
        <div>
          <span className="vault-panel-kicker">Sharing Insights</span>
          <h2>
            Who's reading your project
            {newViews > 0 && <span className="vault-tracking-new-badge">{newViews} new</span>}
          </h2>
        </div>
        <button className="vault-tracking-refresh" onClick={() => { setLoading(true); loadAll(); }} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="vault-tracking-stats">
        <div className="vault-tracking-stat">
          <strong>{stats.visits}</strong>
          <span>Total visits</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{stats.uniqueViewers}</strong>
          <span>Unique viewers</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{formatDuration(stats.totalSeconds)}</strong>
          <span>Total time viewed</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{formatDuration(stats.avgSeconds)}</strong>
          <span>Avg time per visit</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{stats.avgCompletion}%</strong>
          <span>Avg completion</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{stats.downloads}</strong>
          <span>Downloads</span>
        </div>
        <div className="vault-tracking-stat">
          <strong>{stats.lastViewed ? formatWhen(stats.lastViewed) : '—'}</strong>
          <span>Last viewed</span>
        </div>
      </div>

      {activity && (
        <div className="vault-tracking-activity">
          <span className="vault-panel-kicker">Visits — last 30 days</span>
          <div className="vault-tracking-activity-chart">
            {activity.buckets.map(b => (
              <div
                key={b.ts}
                className="vault-tracking-activity-col"
                title={`${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(b.ts))}: ${b.count} visit${b.count === 1 ? '' : 's'}`}
              >
                <div
                  className={`vault-tracking-activity-bar ${b.count === 0 ? 'vault-tracking-activity-bar--empty' : ''}`}
                  style={{ height: `${b.count > 0 ? Math.max(Math.round((b.count / activity.max) * 100), 8) : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="vault-tracking-activity-axis">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>
      )}

      <div className="vault-tracking-links">
        <div className="vault-tracking-links-head">
          <span className="vault-panel-kicker">Trackable Links</span>
          {anyActive && (
            <button className="vault-tracking-kill-all" onClick={handleDeactivateAll}>Deactivate all links</button>
          )}
        </div>
        {isEncrypted ? (
          <p className="vault-tracking-hint">Trackable links are unavailable for encrypted projects — anyone with the link would need your key.</p>
        ) : (
          <>
            <div className="vault-tracking-create">
              <input
                className="vault-modal-input"
                placeholder="Link label (e.g., Sent to producer X)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
              />
              <label className="vault-tracking-gate-toggle">
                <input type="checkbox" checked={requireEmail} onChange={e => setRequireEmail(e.target.checked)} />
                Require email to view
              </label>
              <button className="btn btn-primary btn-sm" onClick={handleCreateLink} disabled={creating}>
                {creating ? 'Creating...' : 'Create link'}
              </button>
            </div>
            {error && <p className="vault-modal-error">{error}</p>}
            {links.length > 0 && (
              <div className="vault-tracking-link-list">
                {links.map(link => (
                  <div key={link.id} className="vault-tracking-link-wrap">
                    <div className={`vault-tracking-link-row ${!link.is_active ? 'vault-tracking-link-row--off' : ''}`}>
                      <div className="vault-tracking-link-info">
                        <strong>{link.label || 'Untitled link'}</strong>
                        <span>{linkGates(link)}</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(link)} disabled={!link.is_active}>
                        {copied === link.id ? 'Copied!' : 'Copy link'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditor(link)}>
                        {editingLink === link.id ? 'Close' : 'Settings'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggleLink(link)}>
                        {link.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                    {editingLink === link.id && draft && (
                      <div className="vault-tracking-editor">
                        <div className="vault-tracking-editor-grid">
                          <label className="vault-tracking-field">
                            <span>Label</span>
                            <input className="vault-modal-input" value={draft.label}
                              onChange={e => setDraft(d => d && { ...d, label: e.target.value })} />
                          </label>
                          <label className="vault-tracking-field">
                            <span>Expires</span>
                            <input className="vault-modal-input" type="datetime-local" value={draft.expiresAt}
                              onChange={e => setDraft(d => d && { ...d, expiresAt: e.target.value })} />
                          </label>
                          <label className="vault-tracking-field">
                            <span>Max visits (blank = unlimited)</span>
                            <input className="vault-modal-input" type="number" min="1" placeholder="Unlimited" value={draft.maxVisits}
                              onChange={e => setDraft(d => d && { ...d, maxVisits: e.target.value })} />
                          </label>
                          <label className="vault-tracking-field">
                            <span>{link.has_passcode && !draft.clearPasscode ? 'Passcode (set — type to replace)' : 'Passcode'}</span>
                            <input className="vault-modal-input" type="text" autoComplete="off"
                              placeholder={link.has_passcode ? 'Unchanged' : 'None'}
                              value={draft.passcode} disabled={draft.clearPasscode}
                              onChange={e => setDraft(d => d && { ...d, passcode: e.target.value })} />
                            {link.has_passcode && (
                              <label className="vault-tracking-check">
                                <input type="checkbox" checked={draft.clearPasscode}
                                  onChange={e => setDraft(d => d && { ...d, clearPasscode: e.target.checked })} />
                                Remove passcode
                              </label>
                            )}
                          </label>
                        </div>
                        <label className="vault-tracking-field">
                          <span>Allowed emails or domains (comma-separated, e.g. jane@studio.com, @a24.com)</span>
                          <input className="vault-modal-input" placeholder="Anyone with the link" value={draft.allowedEmails}
                            onChange={e => setDraft(d => d && { ...d, allowedEmails: e.target.value })} />
                        </label>
                        <label className="vault-tracking-field">
                          <span>NDA / confidentiality agreement (viewers must sign before reading)</span>
                          <textarea className="vault-modal-input vault-tracking-nda-input" rows={4}
                            placeholder="Leave blank for no agreement"
                            value={draft.ndaText}
                            onChange={e => setDraft(d => d && { ...d, ndaText: e.target.value })} />
                        </label>
                        <div className="vault-tracking-editor-toggles">
                          <label className="vault-tracking-check">
                            <input type="checkbox" checked={draft.requireEmail}
                              onChange={e => setDraft(d => d && { ...d, requireEmail: e.target.checked })} />
                            Require email
                          </label>
                          <label className="vault-tracking-check">
                            <input type="checkbox" checked={draft.allowDownload}
                              onChange={e => setDraft(d => d && { ...d, allowDownload: e.target.checked })} />
                            Allow download
                          </label>
                          <label className="vault-tracking-check">
                            <input type="checkbox" checked={draft.notifyOnView}
                              onChange={e => setDraft(d => d && { ...d, notifyOnView: e.target.checked })} />
                            Email me on new visits
                          </label>
                          <label className="vault-tracking-check">
                            <input type="checkbox" checked={draft.watermarkEnabled}
                              onChange={e => setDraft(d => d && { ...d, watermarkEnabled: e.target.checked })} />
                            Watermark pages
                          </label>
                          <label className="vault-tracking-check">
                            <input type="checkbox" checked={draft.verifyEmail}
                              onChange={e => setDraft(d => d && { ...d, verifyEmail: e.target.checked })} />
                            Verify viewer email (code)
                          </label>
                        </div>
                        {linkError && <p className="vault-modal-error">{linkError}</p>}
                        <div className="vault-tracking-editor-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveLink(link)} disabled={savingLink}>
                            {savingLink ? 'Saving...' : 'Save settings'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLink(null); setDraft(null); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {versions.length > 0 && (
        <div className="vault-tracking-versions">
          <span className="vault-panel-kicker">Version History</span>
          <div className="vault-tracking-version-list">
            <div className="vault-tracking-version-row">
              <strong>v{currentVersion}</strong>
              <span>Current — links always serve this version</span>
            </div>
            {versions.filter(v => v.version_number !== currentVersion).map(v => (
              <div key={v.id} className="vault-tracking-version-row vault-tracking-version-row--old">
                <strong>v{v.version_number}</strong>
                <span>{v.note || 'Snapshot'} · {formatWhen(v.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dropoff && (
        <div className="vault-tracking-dropoff">
          <span className="vault-panel-kicker">Where readers drop off</span>
          <p className="vault-tracking-hint">Share of {dropoff.sessionCount} visits that reached each page.</p>
          <div className="vault-tracking-heatmap">
            {dropoff.pages.map(p => (
              <div key={p.i} className="vault-tracking-heat-col" title={`Page ${p.i + 1}: ${p.reachedPct}% of visits · avg ${formatDuration(p.avgSeconds)}`}>
                <div className="vault-tracking-heat-bar" style={{ height: `${Math.max(p.reachedPct, 3)}%` }} />
                <span className="vault-tracking-heat-num">{p.i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="vault-tracking-viewers">
        <div className="vault-tracking-links-head">
          <span className="vault-panel-kicker">Viewers</span>
          {versions.length > 1 && (
            <select
              className="vault-tracking-version-filter"
              value={versionFilter === 'all' ? 'all' : String(versionFilter)}
              onChange={e => setVersionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All versions</option>
              {versions.map(v => (
                <option key={v.id} value={v.version_number}>v{v.version_number}{v.version_number === currentVersion ? ' (current)' : ''}</option>
              ))}
            </select>
          )}
        </div>
        {loading && viewers.length === 0 ? (
          <p className="vault-tracking-hint">Loading...</p>
        ) : viewers.length === 0 ? (
          <p className="vault-tracking-hint">No views yet. Share your project by email or with a trackable link, and every visit will show up here.</p>
        ) : (
          viewers.map(g => {
            const vNotes = viewerNotesFor(g);
            const oNotes = ownerNotesFor(g);
            const isOpen = expanded === g.key;
            const score = engagementScore(g);
            return (
              <div key={g.key} className="vault-tracking-viewer">
                <button className="vault-tracking-viewer-row" onClick={() => setExpanded(isOpen ? null : g.key)}>
                  <div className="vault-tracking-viewer-id">
                    <strong>{g.label}</strong>
                    <span>Last viewed {formatWhen(g.lastViewed)}</span>
                  </div>
                  <div className="vault-tracking-viewer-stats">
                    <span className={`vault-tracking-score ${score >= 70 ? 'vault-tracking-score--hot' : score >= 40 ? 'vault-tracking-score--warm' : ''}`} title="Engagement score: completion, time spent, and repeat visits">
                      {score}
                    </span>
                    <span title="Total time reading">{formatDuration(g.totalSeconds)}</span>
                    <span title="Visits">{g.sessions.length} visit{g.sessions.length === 1 ? '' : 's'}</span>
                    <span title="How far they read">
                      {g.totalPages > 0 ? `${g.maxPages}/${g.totalPages} pages` : `${g.maxReadPct}% read`}
                    </span>
                    {vNotes.length > 0 && <span className="vault-tracking-note-badge">{vNotes.length} note{vNotes.length === 1 ? '' : 's'}</span>}
                  </div>
                  <svg className={`vault-tracking-chevron ${isOpen ? 'vault-tracking-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {isOpen && (
                  <div className="vault-tracking-viewer-detail">
                    <div className="vault-tracking-sessions">
                      {g.sessions.map(s => (
                        <div key={s.id} className="vault-tracking-session-block">
                          <div className="vault-tracking-session">
                            <span>{formatWhen(s.started_at)}</span>
                            <span>{formatDuration(s.duration_seconds)}</span>
                            <span>{s.total_pages > 0 ? `${s.pages_viewed}/${s.total_pages} pages` : `${s.max_scroll_pct}% scrolled`}</span>
                            {geoLabel(s) && <span className="vault-tracking-session-geo">{geoLabel(s)}</span>}
                            {(s.download_count || 0) > 0 && <span className="vault-tracking-session-geo">↓ {s.download_count} download{s.download_count === 1 ? '' : 's'}</span>}
                            {s.version_number != null && <span className="vault-tracking-version-badge">v{s.version_number}</span>}
                            {s.link_label && <span className="vault-tracking-session-link">via "{s.link_label}"</span>}
                          </div>
                          <PageTimeline pageTimes={s.page_times} totalPages={s.total_pages} />
                        </div>
                      ))}
                    </div>

                    {vNotes.length > 0 && (
                      <div className="vault-tracking-notes-block">
                        <span className="vault-panel-kicker">Their notes</span>
                        {vNotes.map(n => (
                          <div key={n.id} className="vault-tracking-note vault-tracking-note--viewer">
                            <p>{n.content}</p>
                            <span>{formatWhen(n.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="vault-tracking-notes-block">
                      <span className="vault-panel-kicker">Your private notes</span>
                      {oNotes.map(n => (
                        <div key={n.id} className="vault-tracking-note">
                          <p>{n.content}</p>
                          <span>{formatWhen(n.created_at)}</span>
                        </div>
                      ))}
                      <div className="vault-tracking-note-input">
                        <input
                          className="vault-modal-input"
                          placeholder="Add a private note about this viewer..."
                          value={ownerNoteDrafts[g.key] || ''}
                          onChange={e => setOwnerNoteDrafts(prev => ({ ...prev, [g.key]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddOwnerNote(g); } }}
                        />
                        <button
                          className="vault-collab-add"
                          onClick={() => handleAddOwnerNote(g)}
                          disabled={savingNote === g.key || !(ownerNoteDrafts[g.key] || '').trim()}
                        >
                          {savingNote === g.key ? '...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {signatures.length > 0 && (
        <div className="vault-tracking-signatures">
          <div className="vault-tracking-links-head">
            <span className="vault-panel-kicker">NDA Signatures</span>
            <button className="btn btn-secondary btn-sm" onClick={handleExportSignatures}>Export CSV</button>
          </div>
          <div className="vault-tracking-sig-list">
            {signatures.map(s => (
              <div key={s.id} className="vault-tracking-sig-row">
                <div className="vault-tracking-sig-who">
                  <strong>{s.signer_name}</strong>
                  {s.signer_email && <span>{s.signer_email}</span>}
                </div>
                <div className="vault-tracking-sig-meta">
                  <span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s.signed_at))}</span>
                  {s.link_label && <span>via "{s.link_label}"</span>}
                  {s.ip_address && <span>{s.ip_address}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
