import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EntityData } from './entity/types';
import { TYPE_LABELS } from './entity/types';
import { EntityHeader } from './entity/EntityHeader';
import { EntityCastCrew } from './entity/EntityCastCrew';
import { Avatar } from './Avatar';

export function EntityPage({ type }: { type: string }) {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchEntity = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch('/api/entity/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setNotFound(false);
      }
    } catch { /* */ }
    setLoading(false);
  }, [slug]);

  const [prevSlug, setPrevSlug] = useState(slug);
  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setLoading(true);
    setData(null);
    setNotFound(false);
  }

  // Record the visit so Projects can rank by real traffic. Fire-and-forget:
  // analytics must never block or fail the page.
  useEffect(() => {
    if (!slug) return;
    fetch('/api/entity/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).catch(() => { /* ignore */ });
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let ignore = false;
    fetch('/api/entity/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).then(res => {
      if (ignore) return;
      if (res.status === 404) { setNotFound(true); return; }
      if (res.ok) return res.json().then((json: EntityData) => {
        if (!ignore) { setData(json); setNotFound(false); }
      });
    }).catch(() => {}).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [slug]);

  const canEdit = !!data?.canEdit;

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
          <p style={{ fontSize: 18, marginBottom: 8 }}>{TYPE_LABELS[type] || 'Page'} not found</p>
          <Link to="/network" className="btn btn-ghost btn-sm">Back to Network</Link>
        </div>
      </div>
    );
  }

  const entity = data.entity;
  const meta = entity.metadata || {};

  return (
    <div className="prof-layout" style={{ overflow: 'auto', height: '100vh' }}>
      <div className="prof-primary">
        <EntityHeader entity={entity} canEdit={canEdit} onUpdate={fetchEntity} />
        <EntityCastCrew castCrew={data.castCrew} />
      </div>
      <div className="prof-sidebar">
        <div className="net-card prof-section">
          <h3 className="prof-section-title">Details</h3>
          <div className="ent-details-list">
            <div className="ent-detail-row">
              <span className="ent-detail-label">Type</span>
              <span className="ent-type-badge ent-type-badge--sm">{TYPE_LABELS[entity.type]}</span>
            </div>
            {entity.year && (
              <div className="ent-detail-row">
                <span className="ent-detail-label">{entity.type === 'company' ? 'Founded' : 'Year'}</span>
                <span>{entity.year}</span>
              </div>
            )}
            {entity.type === 'tvshow' && !!meta.seasons && (
              <div className="ent-detail-row">
                <span className="ent-detail-label">Seasons</span>
                <span>{String(meta.seasons)}</span>
              </div>
            )}
            {entity.type === 'tvshow' && !!meta.network && (
              <div className="ent-detail-row">
                <span className="ent-detail-label">Network</span>
                <span>{String(meta.network)}</span>
              </div>
            )}
            {entity.type === 'company' && !!meta.company_type && (
              <div className="ent-detail-row">
                <span className="ent-detail-label">Type</span>
                <span style={{ textTransform: 'capitalize' }}>{String(meta.company_type)}</span>
              </div>
            )}
            {entity.type === 'music' && !!meta.artist && (
              <div className="ent-detail-row">
                <span className="ent-detail-label">Artist</span>
                <span>{String(meta.artist)}</span>
              </div>
            )}
          </div>
          {entity.genre && entity.genre.length > 0 && (
            <>
              <h4 className="ent-detail-label" style={{ marginTop: 16, marginBottom: 8 }}>Genre</h4>
              <div className="prof-skills-list">
                {entity.genre.map(g => <span key={g} className="chip">{g}</span>)}
              </div>
            </>
          )}
        </div>

        {entity.creator_handle && (
          <div className="net-card prof-section">
            <h3 className="prof-section-title">Created By</h3>
            <Link to={`/profile/${entity.creator_handle}`} className="ent-creator-link">
              <Avatar name={entity.creator_name || '?'} size={36} />
              <span>{entity.creator_name}</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
