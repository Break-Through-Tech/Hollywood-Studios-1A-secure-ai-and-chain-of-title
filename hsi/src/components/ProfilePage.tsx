import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ProfileData, Credit } from './profile/types';
import { ProfileHeader } from './profile/ProfileHeader';
import { ProfileCredits } from './profile/ProfileCredits';
import { ProfileExperience } from './profile/ProfileExperience';
import { ProfileSkills } from './profile/ProfileSkills';
import { ProfileRepresentation } from './profile/ProfileRepresentation';
import { ProfileAwards } from './profile/ProfileAwards';
import { ProfileMedia } from './profile/ProfileMedia';
import { ProfileConnections } from './profile/ProfileConnections';
import { ProfileCompanies } from './profile/ProfileCompanies';
import { TYPE_ROUTES } from './entity/types';
import { blobUrl } from '../blobUrl';

export function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!handle) return;
    try {
      const res = await fetch('/api/profile/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      if (res.ok) {
        const json: ProfileData = await res.json();
        json.profile.skills = typeof json.profile.skills === 'string' ? JSON.parse(json.profile.skills) : json.profile.skills || [];
        json.profile.representation = typeof json.profile.representation === 'string' ? JSON.parse(json.profile.representation) : json.profile.representation || [];
        json.profile.media_links = typeof json.profile.media_links === 'string' ? JSON.parse(json.profile.media_links) : json.profile.media_links || [];
        json.profile.featured_credit_ids = typeof json.profile.featured_credit_ids === 'string' ? JSON.parse(json.profile.featured_credit_ids) : json.profile.featured_credit_ids || [];
        setData(json);
        setNotFound(false);
      }
    } catch { /* */ }
    setLoading(false);
  }, [handle]);

  const [prevHandle, setPrevHandle] = useState(handle);
  if (handle !== prevHandle) {
    setPrevHandle(handle);
    setLoading(true);
    setData(null);
    setNotFound(false);
  }

  useEffect(() => {
    if (!handle) return;
    let ignore = false;
    fetch('/api/profile/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    }).then(res => {
      if (ignore) return;
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) return res.json().then((json: ProfileData) => {
        if (ignore) return;
        json.profile.skills = typeof json.profile.skills === 'string' ? JSON.parse(json.profile.skills) : json.profile.skills || [];
        json.profile.representation = typeof json.profile.representation === 'string' ? JSON.parse(json.profile.representation) : json.profile.representation || [];
        json.profile.media_links = typeof json.profile.media_links === 'string' ? JSON.parse(json.profile.media_links) : json.profile.media_links || [];
        json.profile.featured_credit_ids = typeof json.profile.featured_credit_ids === 'string' ? JSON.parse(json.profile.featured_credit_ids) : json.profile.featured_credit_ids || [];
        setData(json);
        setNotFound(false);
      });
    }).catch(() => {}).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [handle]);

  const loggedInEmail = localStorage.getItem('hsi-user-email') || '';
  const isOwner = data?.profile.email === loggedInEmail;

  if (loading) {
    return (
      <div className="prof-loading">
        <div className="prof-loading-pulse" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'rgba(0,0,0,0.5)' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>Profile not found</p>
          <Link to="/network" className="btn btn-ghost btn-sm">Back to Network</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="prof-layout" style={{ overflow: 'auto', height: '100vh' }}>
      <div className="prof-primary">
        <ProfileHeader profile={data.profile} credits={data.credits} isOwner={isOwner} onUpdate={fetchProfile} />
        <KnownFor credits={data.credits} profile={data.profile} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileCredits credits={data.credits} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileExperience experience={data.experience} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileSkills profile={data.profile} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileRepresentation profile={data.profile} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileAwards awards={data.awards} isOwner={isOwner} onUpdate={fetchProfile} />
        <ProfileMedia profile={data.profile} isOwner={isOwner} onUpdate={fetchProfile} />
      </div>
      <div className="prof-sidebar">
        <ProfileCompanies pages={data.createdPages ?? []} isOwner={isOwner} />
        <ProfileConnections connections={data.connections} />
        <SidebarCredits credits={data.credits} />
      </div>
    </div>
  );
}

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

function KnownFor({ credits, profile, isOwner, onUpdate }: { credits: Credit[]; profile: ProfileData['profile']; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);

  const linkableCredits = credits.filter(c => c.entity_id && c.entity_slug && c.entity_type);

  let knownCredits: Credit[];
  if (profile.featured_credit_ids.length > 0) {
    const featured = profile.featured_credit_ids
      .map(id => linkableCredits.find(c => c.id === id))
      .filter((c): c is Credit => c !== undefined);
    knownCredits = featured.slice(0, 4);
  } else {
    knownCredits = linkableCredits
      .sort((a, b) => (b.year || 0) - (a.year || 0))
      .slice(0, 4);
  }

  if (knownCredits.length === 0 && !isOwner) return null;
  if (linkableCredits.length === 0 && !isOwner) return null;

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Known For</h3>
        {isOwner && linkableCredits.length > 0 && (
          <button className="prof-section-edit" onClick={() => setEditing(true)} title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>
      {knownCredits.length === 0 ? (
        <p className="prof-empty">No featured credits yet — click edit to choose</p>
      ) : (
        <div className="prof-known-grid">
          {knownCredits.map((c, i) => (
            <Link key={i} to={`${TYPE_ROUTES[c.entity_type!]}/${c.entity_slug}`} className="prof-known-card">
              {c.entity_image_url ? (
                <img src={blobUrl(c.entity_image_url) || c.entity_image_url} alt="" className="prof-known-img" />
              ) : (
                <div className="prof-known-placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" />
                    <line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
                    <line x1="17" y1="17" x2="22" y2="17" />
                  </svg>
                </div>
              )}
              <div className="prof-known-info">
                <span className="prof-known-title">{c.title}</span>
                {c.role && <span className="prof-known-role">{c.role}</span>}
                {c.year && <span className="prof-known-year">{c.year}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {editing && (
        <KnownForEditModal
          credits={linkableCredits}
          selectedIds={profile.featured_credit_ids}
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onUpdate(); }}
        />
      )}
    </div>
  );
}

function KnownForEditModal({ credits, selectedIds, profile, onClose, onSaved }: {
  credits: Credit[];
  selectedIds: number[];
  profile: ProfileData['profile'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(selectedIds);
  const [saving, setSaving] = useState(false);

  function toggleCredit(id: number) {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id));
    } else if (selected.length < 4) {
      setSelected([...selected, id]);
    }
  }

  async function handleSave() {
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
        mediaLinks: profile.media_links,
        avatarUrl: profile.avatar_url,
        featuredCreditIds: selected,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="vault-modal">
        <h2 className="vault-modal-title">Choose Featured Credits</h2>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginBottom: 16 }}>
          Select up to 4 credits to feature in your Known For section.
        </p>
        <div className="prof-known-pick-list">
          {credits.map(c => (
            <label key={c.id} className={`prof-known-pick-item${selected.includes(c.id!) ? ' prof-known-pick-selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.includes(c.id!)}
                onChange={() => toggleCredit(c.id!)}
                disabled={!selected.includes(c.id!) && selected.length >= 4}
              />
              <div className="prof-known-pick-info">
                <span className="prof-known-pick-title">{c.title}</span>
                <span className="prof-known-pick-meta">
                  {c.department}{c.role ? ` — ${c.role}` : ''}{c.year ? ` (${c.year})` : ''}
                </span>
              </div>
            </label>
          ))}
        </div>
        <div className="vault-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : `Save (${selected.length}/4)`}
          </button>
        </div>
      </div>
    </>
  );
}

function SidebarCredits({ credits }: { credits: Credit[] }) {
  if (credits.length === 0) return null;

  const sorted = [...credits].sort((a, b) => (b.year || 0) - (a.year || 0));

  return (
    <div className="net-card prof-sidebar-card">
      <div className="prof-sidebar-header">
        <h4>Credits</h4>
        <span className="prof-sidebar-count">{credits.length}</span>
      </div>
      <div className="prof-sidebar-list">
        {sorted.map((c, i) => {
          const inner = (
            <>
              {c.entity_image_url ? (
                <img src={blobUrl(c.entity_image_url) || c.entity_image_url} alt="" className="prof-sidebar-credit-poster" />
              ) : (
                <div className="prof-sidebar-credit-poster prof-sidebar-credit-poster--empty">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                  </svg>
                </div>
              )}
              <div className="prof-sidebar-credit-info">
                <span className="prof-sidebar-credit-title">{c.title}</span>
                <span className="prof-sidebar-credit-meta">
                  {c.role || c.department}{c.year ? ` · ${c.year}` : ''}
                </span>
              </div>
            </>
          );
          return c.entity_id && c.entity_slug && c.entity_type ? (
            <Link key={i} to={`${TYPE_ROUTES[c.entity_type]}/${c.entity_slug}`} className="prof-sidebar-credit prof-sidebar-credit-link">
              {inner}
            </Link>
          ) : (
            <div key={i} className="prof-sidebar-credit">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
