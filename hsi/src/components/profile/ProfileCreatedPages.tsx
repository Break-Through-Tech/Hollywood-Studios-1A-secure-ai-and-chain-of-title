import { Link } from 'react-router-dom';
import type { CreatedPage } from './types';
import { TYPE_LABELS, TYPE_ROUTES } from '../entity/types';
import { blobUrl } from '../../blobUrl';

export function ProfileCreatedPages({ pages }: { pages: CreatedPage[] }) {
  if (pages.length === 0) return null;

  return (
    <div className="net-card prof-section">
      <h3 className="prof-section-title">Created Pages</h3>
      <div className="ent-created-list">
        {pages.map(p => (
          <Link key={p.id} to={`${TYPE_ROUTES[p.type]}/${p.slug}`} className="ent-created-row">
            {p.image_url ? (
              <img src={blobUrl(p.image_url)} alt={p.title} className="ent-created-thumb" />
            ) : (
              <div className="ent-created-thumb ent-created-thumb--empty">
                {p.title.charAt(0)}
              </div>
            )}
            <div className="ent-created-info">
              <span className="ent-created-title">{p.title}</span>
              <span className="ent-created-meta">
                <span className="ent-type-badge ent-type-badge--sm">{TYPE_LABELS[p.type]}</span>
                {p.year && <span>{p.year}</span>}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
