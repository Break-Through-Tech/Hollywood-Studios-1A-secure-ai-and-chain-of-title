import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Experience } from './types';
import { EditModal, EditButton } from './EditModal';
import { EntitySearch } from '../entity/EntitySearch';
import { blobUrl } from '../../blobUrl';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

function formatDateRange(start: string | null, end: string | null) {
  const s = start ? new Date(start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  const e = end ? new Date(end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Present';
  return s ? `${s} — ${e}` : e;
}

export function ProfileExperience({ experience, isOwner, onUpdate }: { experience: Experience[]; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState<Experience | 'new' | null>(null);

  return (
    <div className="net-card prof-section">
      <div className="prof-section-header">
        <h3 className="prof-section-title">Experience</h3>
        {isOwner && <EditButton onClick={() => setEditing('new')} />}
      </div>
      {experience.length === 0 ? (
        <p className="prof-empty">No experience added yet</p>
      ) : (
        experience.map(exp => (
          <div key={exp.id} className="prof-exp-item" onClick={isOwner ? () => setEditing(exp) : undefined} style={isOwner ? { cursor: 'pointer' } : undefined}>
            <div className="prof-exp-top">
              <div className="prof-exp-head">
                {exp.company_slug && (
                  <Link to={`/company/${exp.company_slug}`} className="co-mini-logo" onClick={e => e.stopPropagation()} aria-hidden="true" tabIndex={-1}>
                    {exp.company_logo_url ? <img src={blobUrl(exp.company_logo_url)} alt="" /> : exp.company.charAt(0)}
                  </Link>
                )}
                <div>
                  <span className="prof-exp-title">{exp.job_title}</span>
                  {exp.company_slug
                    ? <Link to={`/company/${exp.company_slug}`} className="prof-exp-company prof-exp-company-link" onClick={e => e.stopPropagation()}>{exp.company}</Link>
                    : <span className="prof-exp-company">{exp.company}</span>}
                </div>
              </div>
              <span className="prof-exp-dates">{formatDateRange(exp.start_date, exp.end_date)}</span>
            </div>
            {exp.description && <p className="prof-exp-desc">{exp.description}</p>}
          </div>
        ))
      )}
      {editing && (
        <ExperienceEditModal
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onUpdate(); }}
          onDeleted={() => { setEditing(null); onUpdate(); }}
        />
      )}
    </div>
  );
}

function ExperienceEditModal({ entry, onClose, onSaved, onDeleted }: {
  entry: Experience | null; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [company, setCompany] = useState(entry?.company || '');
  const [companyEntityId, setCompanyEntityId] = useState<number | null>(entry?.company_entity_id ?? null);
  const [jobTitle, setJobTitle] = useState(entry?.job_title || '');
  const [startDate, setStartDate] = useState(entry?.start_date?.slice(0, 10) || '');
  const [endDate, setEndDate] = useState(entry?.end_date?.slice(0, 10) || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!company.trim() || !jobTitle.trim()) return;
    setSaving(true);
    await fetch('/api/profile/experience/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getLoggedInEmail(),
        id: entry?.id,
        company: company.trim(),
        companyEntityId,
        jobTitle: jobTitle.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        description: description.trim() || null,
      }),
    });
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!entry?.id || !confirm('Delete this experience?')) return;
    await fetch('/api/profile/experience/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: getLoggedInEmail(), id: entry.id }),
    });
    onDeleted();
  }

  return (
    <EditModal title={entry ? 'Edit Experience' : 'Add Experience'} onClose={onClose}>
      <div className="vault-modal-field">
        <label className="prof-field-label">Job Title</label>
        <input className="app-input" placeholder="e.g. Head of Development" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Company</label>
        <EntitySearch
          type="company"
          value={company}
          entityId={companyEntityId}
          placeholder="e.g. Paramount Pictures"
          onTextChange={setCompany}
          onSelect={e => setCompanyEntityId(e ? e.id : null)}
        />
        <p className="prof-field-hint">Pick a company page to link it — you'll be listed on that page. Or just type a name.</p>
      </div>
      <div className="prof-edit-row">
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">Start Date</label>
          <input className="app-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="vault-modal-field" style={{ flex: 1 }}>
          <label className="prof-field-label">End Date</label>
          <input className="app-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} placeholder="Leave empty for Present" />
        </div>
      </div>
      <div className="vault-modal-field">
        <label className="prof-field-label">Description</label>
        <textarea className="app-textarea" rows={3} placeholder="What did you do there?" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="vault-modal-actions">
        {entry?.id && <button className="btn btn-danger" onClick={handleDelete}>Delete</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !company.trim() || !jobTitle.trim()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </EditModal>
  );
}
