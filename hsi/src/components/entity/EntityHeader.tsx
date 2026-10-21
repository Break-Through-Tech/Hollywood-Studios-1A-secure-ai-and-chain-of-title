import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Entity } from './types';
import { TYPE_LABELS } from './types';
import { EntityEditModal } from './EntityEditModal';
import { EditButton } from '../profile/EditModal';
import { blobUrl } from '../../blobUrl';

function getEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean).pop(); return id ? `https://player.vimeo.com/video/${id}` : null; }
  } catch { /* */ }
  return null;
}

export function EntityHeader({ entity, canEdit, onUpdate }: { entity: Entity; canEdit: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const meta = entity.metadata || {};
  const trailerUrl = (meta.trailer_url as string) || '';
  const trailerEmbed = trailerUrl ? getEmbedUrl(trailerUrl) : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const email = localStorage.getItem('hsi-user-email') || '';
      const res = await fetch('/api/entity/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, id: entity.id }),
      });
      if (res.ok) navigate('/network');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="net-card prof-section">
      <div className="ent-header">
        {entity.image_url && (
          <div className="ent-poster-wrap">
            <img src={blobUrl(entity.image_url)} alt={entity.title} className={`ent-poster ${entity.type === 'company' ? 'ent-poster--logo' : ''}`} />
          </div>
        )}
        <div className="ent-header-info">
          <div className="ent-header-top">
            <span className="ent-type-badge">{TYPE_LABELS[entity.type]}</span>
            {canEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <EditButton onClick={() => setEditing(true)} />
                {showDeleteConfirm ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowDeleteConfirm(true)} title="Delete" aria-label="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          <h1 className="ent-title">{entity.title}</h1>
          <div className="ent-meta-row">
            {entity.year && <span className="ent-year">{entity.year}</span>}
            {entity.type === 'tvshow' && !!meta.seasons && <span className="ent-meta-item">{String(meta.seasons)} Season{Number(meta.seasons) > 1 ? 's' : ''}</span>}
            {entity.type === 'tvshow' && !!meta.network && <span className="ent-meta-item">{String(meta.network)}</span>}
            {entity.type === 'company' && !!meta.company_type && <span className="ent-meta-item">{String(meta.company_type)}</span>}
            {entity.type === 'music' && !!meta.artist && <span className="ent-meta-item">{String(meta.artist)}</span>}
          </div>
          {entity.genre && entity.genre.length > 0 && (
            <div className="prof-skills-list" style={{ marginTop: 12 }}>
              {entity.genre.map(g => <span key={g} className="chip">{g}</span>)}
            </div>
          )}
        </div>
      </div>

      {entity.description && <p className="ent-description">{entity.description}</p>}

      {trailerEmbed && (
        <div className="ent-trailer">
          <iframe src={trailerEmbed} title="Trailer" allowFullScreen frameBorder="0" className="ent-trailer-iframe" />
        </div>
      )}

      {entity.type === 'music' && !!meta.link && (
        <a href={String(meta.link)} target="_blank" rel="noopener noreferrer" className="ent-external-link">
          Listen →
        </a>
      )}

      {editing && <EntityEditModal entity={entity} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onUpdate(); }} />}
    </div>
  );
}
