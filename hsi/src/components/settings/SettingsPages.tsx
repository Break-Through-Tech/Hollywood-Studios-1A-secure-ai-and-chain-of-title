import { useState, useEffect } from 'react';

interface Page {
  id: number;
  page_name: string;
  platform: string;
  page_url: string | null;
  ai_watching: boolean;
  privacy: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'M7.8 2h8.4C19 2 22 5 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C5 22 2 19 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52v-3.4c-.01 0-.73-.16-.73-.16',
  youtube: 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z',
};

export function SettingsPages({ email }: { email: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState('instagram');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/pages/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then(setPages);
  }, [email]);

  async function addPage() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/settings/pages/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, pageName: newName.trim(), platform: newPlatform, pageUrl: newUrl.trim() || null }),
    });
    const page = await res.json();
    setPages((prev) => [page, ...prev]);
    setShowAdd(false);
    setNewName('');
    setNewUrl('');
    setSaving(false);
  }

  async function toggleWatching(page: Page) {
    const updated = !page.ai_watching;
    await fetch('/api/settings/pages/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, id: page.id, aiWatching: updated }),
    });
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, ai_watching: updated } : p)));
  }

  async function togglePrivacy(page: Page) {
    const updated = page.privacy === 'public' ? 'private' : 'public';
    await fetch('/api/settings/pages/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, id: page.id, privacy: updated }),
    });
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, privacy: updated } : p)));
  }

  async function deletePage(id: number) {
    await fetch('/api/settings/pages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, id }),
    });
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  function enableAllWatching() {
    pages.forEach((p) => {
      if (!p.ai_watching) toggleWatching(p);
    });
  }

  return (
    <div className="set-pages">
      <h2 className="set-heading">Manage Pages <span className="set-count">({pages.length})</span></h2>
      <p className="set-subtitle">You have {pages.length} page{pages.length !== 1 ? 's' : ''} linked to Palo.</p>

      <div className="set-pages-actions">
        <button className="btn btn-secondary" onClick={() => setShowAdd(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          Add Page
        </button>
        <button className="btn btn-primary" onClick={enableAllWatching}>Enable Watching</button>
      </div>

      {pages.length > 0 && (
        <div className="set-table">
          <div className="set-table-header">
            <span className="set-table-col set-table-col--page">Page</span>
            <span className="set-table-col set-table-col--watching">AI Watching</span>
            <span className="set-table-col set-table-col--privacy">Profile Privacy</span>
          </div>
          {pages.map((page) => (
            <div key={page.id} className="set-table-row">
              <div className="set-table-col set-table-col--page">
                <div className="set-page-icons">
                  {(PLATFORM_ICONS[page.platform] ? [page.platform] : ['instagram']).map((pl) => (
                    <svg key={pl} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5">
                      <path d={PLATFORM_ICONS[pl]} />
                    </svg>
                  ))}
                </div>
                <span className="set-page-name">{page.page_name}</span>
                <button className="set-page-menu" onClick={() => deletePage(page.id)} title="Remove page">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
              </div>
              <div className="set-table-col set-table-col--watching">
                <button className={`set-watching-badge ${page.ai_watching ? 'active' : ''}`} onClick={() => toggleWatching(page)}>
                  <span className="set-watching-dot" />
                  {page.ai_watching ? 'Watching' : 'Off'}
                </button>
              </div>
              <div className="set-table-col set-table-col--privacy">
                <button className="set-privacy-btn" onClick={() => togglePrivacy(page)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {page.privacy === 'public' ? (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                    ) : (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M1 1l22 22" /></>
                    )}
                  </svg>
                  {page.privacy === 'public' ? 'Public' : 'Private'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="set-modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="set-modal-title">Add Page</h3>
            <label className="set-label">Page Name</label>
            <input type="text" className="set-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Page" autoFocus />
            <label className="set-label">Platform</label>
            <select className="set-input" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
            </select>
            <label className="set-label">URL (optional)</label>
            <input type="text" className="set-input" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." />
            <div className="set-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addPage} disabled={saving}>{saving ? 'Adding...' : 'Add Page'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
