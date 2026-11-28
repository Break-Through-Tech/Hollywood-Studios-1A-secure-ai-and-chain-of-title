import { useState, useRef } from 'react';
import type { Profile, Credit } from './types';
import { EditModal, EditButton } from './EditModal';
import { blobUrl } from '../../blobUrl';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

function getPrimaryDepartment(credits: Credit[]): string | null {
  if (credits.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const c of credits) {
    counts[c.department] = (counts[c.department] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getCareerSpan(credits: Credit[]): string | null {
  const years = credits.map(c => c.year).filter((y): y is number => y !== null);
  if (years.length === 0) return null;
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (min === max) return String(min);
  return `${min}–${max}`;
}

const BIO_TRUNCATE_LENGTH = 300;

export function ProfileHeader({ profile, credits, isOwner, onUpdate }: { profile: Profile; credits: Credit[]; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryDept = getPrimaryDepartment(credits);
  const careerSpan = getCareerSpan(credits);
  const creditYears = credits.map(c => c.year).filter((y): y is number => y !== null);
  const careerLength = creditYears.length >= 2
    ? Math.max(...creditYears) - Math.min(...creditYears)
    : null;

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const uploadRes = await fetch('/api/upload/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, fileName: `avatars/${profile.handle}-${Date.now()}.${file.name.split('.').pop()}` }),
      });
      const { url } = await uploadRes.json();
      if (!url) throw new Error('Upload failed');
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
          avatarUrl: url,
          featuredCreditIds: profile.featured_credit_ids,
        }),
      });
      onUpdate();
    } catch (err) {
      console.error('Avatar upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="net-card prof-hero">
      <div className="prof-hero-top">
        <div className="prof-hero-photo">
          <div className="prof-avatar-wrap">
            {profile.avatar_url ? (
              <img src={blobUrl(profile.avatar_url) || profile.avatar_url} alt="" className="prof-hero-img" />
            ) : (
              <div className="prof-hero-initials">
                {profile.display_name.charAt(0)}
              </div>
            )}
            {isOwner && (
              <>
                <button
                  className="prof-avatar-edit-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Change profile picture"
                >
                  {uploading ? (
                    <span className="prof-avatar-spinner" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                />
              </>
            )}
          </div>
        </div>
        <div className="prof-hero-info">
          <div className="prof-hero-name-row">
            <h1 className="prof-hero-name">{profile.display_name}</h1>
            {profile.is_directory && (
              <span className="chip" title="Public reference entry — not an HSI member account">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Reference
              </span>
            )}
            {isOwner && <EditButton onClick={() => setEditing(true)} />}
          </div>
          {profile.headline && <p className="prof-hero-headline">{profile.headline}</p>}
          {(profile.location || careerSpan) && (
            <div className="prof-hero-meta">
              {careerSpan && <span className="prof-hero-span">{careerSpan}</span>}
              {profile.location && (
                <span className="prof-hero-location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  {profile.location}
                </span>
              )}
            </div>
          )}
          {primaryDept && (
            <span className="prof-hero-dept-badge">{primaryDept}</span>
          )}
          {(credits.length > 0 || careerLength !== null) && (
            <div className="prof-hero-stats">
              {credits.length > 0 && (
                <div className="prof-hero-stat">
                  <span className="prof-hero-stat-num">{credits.length}</span>
                  <span className="prof-hero-stat-label">{credits.length === 1 ? 'Credit' : 'Credits'}</span>
                </div>
              )}
              {careerLength !== null && careerLength > 0 && (
                <div className="prof-hero-stat">
                  <span className="prof-hero-stat-num">{careerLength}</span>
                  <span className="prof-hero-stat-label">{careerLength === 1 ? 'Year' : 'Years'}</span>
                </div>
              )}
              {(() => {
                const depts = new Set(credits.map(c => c.department));
                return depts.size > 1 ? (
                  <div className="prof-hero-stat">
                    <span className="prof-hero-stat-num">{depts.size}</span>
                    <span className="prof-hero-stat-label">Depts</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      </div>
      {profile.bio && (
        <div className="prof-hero-about">
          <h3 className="prof-hero-about-title">About</h3>
          <p className="prof-hero-about-text">
            {!bioExpanded && profile.bio.length > BIO_TRUNCATE_LENGTH
              ? profile.bio.slice(0, BIO_TRUNCATE_LENGTH).trimEnd() + '...'
              : profile.bio}
          </p>
          {profile.bio.length > BIO_TRUNCATE_LENGTH && (
            <button className="prof-hero-about-toggle" onClick={() => setBioExpanded(!bioExpanded)}>
              {bioExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {profile.is_directory && (
        <p className="prof-hero-provenance">
          Public reference entry compiled from{' '}
          {profile.source === 'imdb' ? (
            <a href={profile.source_url || 'https://www.imdb.com'} target="_blank" rel="noopener noreferrer">IMDb</a>
          ) : (
            <><a href={profile.source_url || 'https://www.wikidata.org'} target="_blank" rel="noopener noreferrer">Wikidata</a>{' '}and Wikipedia</>
          )}. Not a member account.
          {profile.image_attribution && <> {/^photo/i.test(profile.image_attribution) ? profile.image_attribution : `Photo: ${profile.image_attribution}`}.</>}
        </p>
      )}

      {editing && (
        <HeaderEditModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onUpdate(); }}
        />
      )}
    </div>
  );
}

function HeaderEditModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [headline, setHeadline] = useState(profile.headline || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [location, setLocation] = useState(profile.location || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await fetch('/api/profile/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        handle: profile.handle,
        displayName,
        headline: headline || null,
        bio: bio || null,
        location: location || null,
        skills: profile.skills,
        representation: profile.representation,
        mediaLinks: profile.media_links,
        avatarUrl: profile.avatar_url,
        featuredCreditIds: profile.featured_credit_ids,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title="Edit Profile" onClose={onClose}>
      <div className="vault-modal-field">
        <label className="prof-field-label">Display Name</label>
        <input className="app-input" value={displayName} onChange={e => setDisplayName(e.target.value)} />
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Headline</label>
        <input className="app-input" placeholder="e.g. Executive Producer | Showrunner" value={headline} onChange={e => setHeadline(e.target.value)} />
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Location</label>
        <input className="app-input" placeholder="e.g. Los Angeles, CA" value={location} onChange={e => setLocation(e.target.value)} />
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Bio</label>
        <textarea className="app-textarea" rows={4} placeholder="Tell your story..." value={bio} onChange={e => setBio(e.target.value)} />
      </div>
      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !displayName.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
