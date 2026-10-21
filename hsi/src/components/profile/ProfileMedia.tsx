import { useState } from 'react';
import type { Profile, MediaEntry } from './types';
import { EditModal, EditButton } from './EditModal';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch { /* */ }
  return null;
}

export function ProfileMedia({ profile, isOwner, onUpdate }: { profile: Profile; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const media: MediaEntry[] = Array.isArray(profile.media_links) ? profile.media_links : [];

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Reel & Media</h3>
        {isOwner && <EditButton onClick={() => setEditing(true)} />}
      </div>
      {media.length === 0 ? (
        <p className="prof-empty">No media added yet</p>
      ) : (
        <div className="prof-media-grid">
          {media.map((m, i) => {
            const embed = getEmbedUrl(m.url);
            return (
              <div key={i} className="prof-media-card">
                {embed ? (
                  <iframe className="prof-media-embed" src={embed} title={m.title} allowFullScreen frameBorder="0" />
                ) : (
                  <div className="prof-media-embed prof-media-placeholder">
                    <span>Link</span>
                  </div>
                )}
                <div className="prof-media-title">{m.title}</div>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <MediaEditModal profile={profile} media={media} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdate(); }} />
      )}
    </div>
  );
}

function MediaEditModal({ profile, media, onClose, onSaved }: { profile: Profile; media: MediaEntry[]; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<MediaEntry[]>(media.length > 0 ? media.map(m => ({ ...m })) : []);
  const [saving, setSaving] = useState(false);

  function addMedia() {
    setItems([...items, { url: '', title: '', type: 'youtube' }]);
  }

  function updateItem(i: number, field: string, value: string) {
    const updated = [...items];
    (updated[i] as unknown as Record<string, string>)[field] = value;
    setItems(updated);
  }

  async function handleSave() {
    const valid = items.filter(m => m.url.trim() && m.title.trim());
    setSaving(true);
    await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        handle: profile.handle,
        displayName: profile.display_name,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        skills: profile.skills,
        representation: profile.representation,
        mediaLinks: valid,
        featuredCreditIds: profile.featured_credit_ids,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title="Edit Reel & Media" onClose={onClose}>
      <div className="prof-edit-list">
        {items.map((m, i) => (
          <div key={i} className="prof-edit-item">
            <div className="prof-edit-row">
              <input className="app-input" placeholder="Title" value={m.title} onChange={e => updateItem(i, 'title', e.target.value)} />
              <button className="prof-edit-remove" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>×</button>
            </div>
            <input className="app-input" placeholder="YouTube or Vimeo URL" value={m.url} onChange={e => updateItem(i, 'url', e.target.value)} />
          </div>
        ))}
      </div>
      <button className="prof-edit-add" onClick={addMedia}>+ Add Media</button>
      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
