import { useState } from 'react';
import type { Award } from './types';
import { EditModal, EditButton } from './EditModal';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

export function ProfileAwards({ awards, isOwner, onUpdate }: { awards: Award[]; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState<Award | 'new' | null>(null);

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Awards & Nominations</h3>
        {isOwner && <EditButton onClick={() => setEditing('new')} />}
      </div>
      {awards.length === 0 ? (
        <p className="prof-empty">No awards yet</p>
      ) : (
        awards.map(a => (
          <div key={a.id} className="prof-award-row" onClick={isOwner ? () => setEditing(a) : undefined} style={isOwner ? { cursor: 'pointer' } : undefined}>
            <span className={`prof-award-badge ${a.result === 'Won' ? 'prof-award-badge--won' : 'prof-award-badge--nom'}`}>
              {a.result === 'Won' ? '★' : '☆'}
            </span>
            <div className="prof-award-info">
              <span className="prof-award-name">{a.award_name}</span>
              {a.category && <span className="prof-award-category">{a.category}</span>}
            </div>
            <div className="prof-award-meta">
              {a.project && <span className="prof-award-project">{a.project}</span>}
              {a.year && <span className="prof-award-year">{a.year}</span>}
            </div>
          </div>
        ))
      )}
      {editing && (
        <AwardEditModal
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onUpdate(); }}
          onDeleted={() => { setEditing(null); onUpdate(); }}
        />
      )}
    </div>
  );
}

function AwardEditModal({ entry, onClose, onSaved, onDeleted }: {
  entry: Award | null; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [awardName, setAwardName] = useState(entry?.award_name || '');
  const [category, setCategory] = useState(entry?.category || '');
  const [year, setYear] = useState(entry?.year?.toString() || '');
  const [result, setResult] = useState(entry?.result || 'Nominated');
  const [project, setProject] = useState(entry?.project || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!awardName.trim()) return;
    setSaving(true);
    await fetch('/api/profile/awards/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        id: entry?.id,
        awardName: awardName.trim(),
        category: category.trim() || null,
        year: year ? parseInt(year) : null,
        result,
        project: project.trim() || null,
      }),
    });
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!entry?.id || !confirm('Delete this award?')) return;
    await fetch('/api/profile/awards/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: getLoggedInEmail(), id: entry.id }),
    });
    onDeleted();
  }

  return (
    <EditModal title={entry ? 'Edit Award' : 'Add Award'} onClose={onClose}>
      <div className="vault-modal-field">
        <label className="prof-field-label">Award</label>
        <input className="app-input" placeholder="e.g. Academy Award, Emmy" value={awardName} onChange={e => setAwardName(e.target.value)} />
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Category</label>
        <input className="app-input" placeholder="e.g. Best Picture" value={category} onChange={e => setCategory(e.target.value)} />
      </div>
      <div className="prof-edit-row">
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">Year</label>
          <input className="app-input" type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">Result</label>
          <select className="app-input" value={result} onChange={e => setResult(e.target.value)}>
            <option value="Nominated">Nominated</option>
            <option value="Won">Won</option>
          </select>
        </div>
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Associated Project</label>
        <input className="app-input" placeholder="Film or show name" value={project} onChange={e => setProject(e.target.value)} />
      </div>
      <div className="vault-modal-actions">
        {entry?.id && <button className="btn btn-danger" onClick={handleDelete}>Delete</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !awardName.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
