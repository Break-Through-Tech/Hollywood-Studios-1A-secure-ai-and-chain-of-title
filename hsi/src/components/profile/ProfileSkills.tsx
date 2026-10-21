import { useState } from 'react';
import type { Profile } from './types';
import { EditModal, EditButton } from './EditModal';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

export function ProfileSkills({ profile, isOwner, onUpdate }: { profile: Profile; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const skills: string[] = Array.isArray(profile.skills) ? profile.skills : [];

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Skills & Specialties</h3>
        {isOwner && <EditButton onClick={() => setEditing(true)} />}
      </div>
      {skills.length === 0 ? (
        <p className="prof-empty">No skills added yet</p>
      ) : (
        <div className="prof-skills-list">
          {skills.map(s => <span key={s} className="prof-skill-chip">{s}</span>)}
        </div>
      )}
      {editing && (
        <SkillsEditModal profile={profile} skills={skills} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdate(); }} />
      )}
    </div>
  );
}

function SkillsEditModal({ profile, skills, onClose, onSaved }: { profile: Profile; skills: string[]; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<string[]>([...skills]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  function addSkill() {
    const val = input.trim();
    if (val && !items.includes(val)) {
      setItems([...items, val]);
      setInput('');
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
        skills: items,
        representation: profile.representation,
        mediaLinks: profile.media_links,
        featuredCreditIds: profile.featured_credit_ids,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title="Edit Skills" onClose={onClose}>
      <div className="prof-skills-list" style={{ marginBottom: 16 }}>
        {items.map(s => (
          <span key={s} className="prof-skill-chip prof-skill-chip--editable" onClick={() => setItems(items.filter(x => x !== s))}>
            {s} ×
          </span>
        ))}
      </div>
      <div className="prof-edit-row">
        <input className="app-input" placeholder="Add a skill..." value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
        />
        <button className="btn btn-secondary" onClick={addSkill} style={{ whiteSpace: 'nowrap' }}>Add</button>
      </div>
      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
