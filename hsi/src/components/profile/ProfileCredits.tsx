import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Credit } from './types';
import { EditModal, EditButton } from './EditModal';
import { EntitySearch } from '../entity/EntitySearch';
import { EntityCreateModal } from '../entity/EntityCreateModal';
import { TYPE_ROUTES } from '../entity/types';
import { blobUrl } from '../../blobUrl';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }
const DEPARTMENTS = ['Acting', 'Directing', 'Producing', 'Writing', 'Music', 'Camera', 'Editing', 'Other'];

/**
 * Known departments first, then anything else present in the data. Grouping by
 * a fixed list alone silently drops credits whose department isn't on it.
 */
function departmentsIn(credits: Credit[]): string[] {
  const present = new Set(credits.map(c => c.department).filter(Boolean));
  const ordered = DEPARTMENTS.filter(d => present.has(d));
  const extra = [...present].filter(d => !DEPARTMENTS.includes(d)).sort();
  return [...ordered, ...extra];
}
const WORK_TYPES = ['Film', 'TV', 'Music Video', 'Short', 'Web Series'];

const COLLAPSED_COUNT = 6;

export function ProfileCredits({ credits, isOwner, onUpdate }: { credits: Credit[]; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const grouped = departmentsIn(credits)
    .map(dept => ({ dept, items: credits.filter(c => c.department === dept) }))
    .filter(g => g.items.length > 0);

  const totalCredits = credits.length;
  const showToggle = totalCredits > COLLAPSED_COUNT;

  let remaining = expanded ? Infinity : COLLAPSED_COUNT;

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Credits</h3>
        {isOwner && <EditButton onClick={() => setEditing(true)} />}
      </div>
      {grouped.length === 0 ? (
        <p className="prof-empty">No credits yet</p>
      ) : (
        grouped.map(g => {
          if (remaining <= 0) return null;
          const visible = g.items.slice(0, remaining);
          remaining -= visible.length;
          return (
            <div key={g.dept} className="prof-credits-group">
              <h4 className="prof-credits-dept">{g.dept}</h4>
              {visible.map((c, i) => (
                <div key={i} className="prof-credit-row">
                  {c.entity_image_url ? (
                    <img src={blobUrl(c.entity_image_url)} alt={c.title} className="prof-credit-poster" loading="lazy" />
                  ) : (
                    <span className="prof-credit-poster prof-credit-poster--empty">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></svg>
                    </span>
                  )}
                  <span className="prof-credit-year">{c.year || '—'}</span>
                  <div>
                    {c.entity_id && c.entity_slug && c.entity_type ? (
                      <Link to={`${TYPE_ROUTES[c.entity_type]}/${c.entity_slug}`} className="prof-credit-title prof-credit-link">{c.title}</Link>
                    ) : (
                      <span className="prof-credit-title">{c.title}</span>
                    )}
                    {c.role && <span className="prof-credit-role"> — {c.role}</span>}
                  </div>
                  {c.work_type && <span className="prof-credit-type">{c.work_type}</span>}
                </div>
              ))}
            </div>
          );
        })
      )}
      {showToggle && (
        <button className="prof-credits-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${totalCredits} credits`}
        </button>
      )}
      {editing && (
        <CreditsEditModal credits={credits} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdate(); }} />
      )}
    </div>
  );
}

function CreditsEditModal({ credits, onClose, onSaved }: { credits: Credit[]; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Credit[]>(credits.length > 0 ? credits.map(c => ({ ...c })) : []);
  const [saving, setSaving] = useState(false);
  const [creatingForIndex, setCreatingForIndex] = useState<number | null>(null);

  function addCredit() {
    setItems([...items, { department: 'Acting', title: '', year: null, role: null, work_type: 'Film', entity_id: null }]);
  }

  function updateItem(i: number, field: string, value: string | number | null) {
    const updated = [...items];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setItems(updated);
  }

  function handleEntitySelect(i: number, entity: { id: number; title: string; type: string; slug: string } | null) {
    const updated = [...items];
    if (entity) {
      updated[i] = { ...updated[i], entity_id: entity.id, entity_type: entity.type, entity_slug: entity.slug, title: entity.title };
    } else {
      updated[i] = { ...updated[i], entity_id: null, entity_type: undefined, entity_slug: undefined };
    }
    setItems(updated);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const valid = items.filter(c => c.title.trim());
    setSaving(true);
    await fetch('/api/profile/credits/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        credits: valid.map((c, i) => ({
          department: c.department,
          title: c.title.trim(),
          year: c.year,
          role: c.role,
          workType: c.work_type,
          sortOrder: i,
          entityId: c.entity_id || null,
        })),
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <EditModal title="Edit Credits" onClose={onClose}>
      <div className="prof-edit-list">
        {items.map((c, i) => (
          <div key={i} className="prof-edit-item">
            <div className="prof-edit-row">
              <select className="app-input prof-input-sm" value={c.department} onChange={e => updateItem(i, 'department', e.target.value)}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="app-input prof-input-sm" value={c.work_type || ''} onChange={e => updateItem(i, 'work_type', e.target.value || null)}>
                <option value="">Type</option>
                {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button className="prof-edit-remove" onClick={() => removeItem(i)} title="Remove">×</button>
            </div>
            <EntitySearch
              value={c.title}
              entityId={c.entity_id || null}
              onSelect={ent => handleEntitySelect(i, ent)}
              onTextChange={text => updateItem(i, 'title', text)}
              onCreateNew={() => setCreatingForIndex(i)}
            />
            <div className="prof-edit-row">
              <input className="app-input prof-input-sm" type="number" placeholder="Year" value={c.year || ''} onChange={e => updateItem(i, 'year', e.target.value ? parseInt(e.target.value) : null)} />
              <input className="app-input" placeholder="Role / Character" value={c.role || ''} onChange={e => updateItem(i, 'role', e.target.value || null)} />
            </div>
          </div>
        ))}
      </div>
      <button className="prof-edit-add" onClick={addCredit}>+ Add Credit</button>
      <div className="vault-modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Credits'}
        </button>
      </div>
      {creatingForIndex !== null && (
        <EntityCreateModal
          onClose={() => setCreatingForIndex(null)}
          onCreated={(entity) => {
            handleEntitySelect(creatingForIndex, entity);
            updateItem(creatingForIndex, 'title', entity.title);
            setCreatingForIndex(null);
          }}
        />
      )}
    </EditModal>
  );
}
