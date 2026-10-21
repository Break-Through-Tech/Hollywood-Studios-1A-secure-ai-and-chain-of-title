import { useState } from 'react';
import type { Profile, RepEntry } from './types';
import { EditModal, EditButton } from './EditModal';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }
const REP_ROLES = ['Agent', 'Manager', 'Lawyer', 'Publicist'];

export function ProfileRepresentation({ profile, isOwner, onUpdate }: { profile: Profile; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const reps: RepEntry[] = Array.isArray(profile.representation) ? profile.representation : [];

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Representation</h3>
        {isOwner && <EditButton onClick={() => setEditing(true)} />}
      </div>
      {reps.length === 0 ? (
        <p className="prof-empty">No representation listed</p>
      ) : (
        reps.map((r, i) => (
          <div key={i} className="prof-rep-card">
            <span className="prof-rep-role">{r.role}</span>
            <span className="prof-rep-name">{r.name}</span>
            <span className="prof-rep-company">{r.company}</span>
          </div>
        ))
      )}
      {editing && (
        <RepEditModal profile={profile} reps={reps} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdate(); }} />
      )}
    </div>
  );
}

function RepEditModal({ profile, reps, onClose, onSaved }: { profile: Profile; reps: RepEntry[]; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<RepEntry[]>(reps.length > 0 ? reps.map(r => ({ ...r })) : []);
  const [saving, setSaving] = useState(false);

  function addRep() {
    setItems([...items, { name: '', company: '', role: 'Agent' }]);
  }

  function updateItem(i: number, field: string, value: string) {
    const updated = [...items];
    (updated[i] as unknown as Record<string, string>)[field] = value;
    setItems(updated);
  }

  async function handleSave() {
    const valid = items.filter(r => r.name.trim() && r.company.trim());
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
        representation: valid,
        mediaLinks: profile.media_links,
        featuredCreditIds: profile.featured_credit_ids,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title="Edit Representation" onClose={onClose}>
      <div className="prof-edit-list">
        {items.map((r, i) => (
          <div key={i} className="prof-edit-item">
            <div className="prof-edit-row">
              <select className="app-input prof-input-sm" value={r.role} onChange={e => updateItem(i, 'role', e.target.value)}>
                {REP_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <button className="prof-edit-remove" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>×</button>
            </div>
            <input className="app-input" placeholder="Name" value={r.name} onChange={e => updateItem(i, 'name', e.target.value)} />
            <input className="app-input" placeholder="Company" value={r.company} onChange={e => updateItem(i, 'company', e.target.value)} />
          </div>
        ))}
      </div>
      <button className="prof-edit-add" onClick={addRep}>+ Add Representative</button>
      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
