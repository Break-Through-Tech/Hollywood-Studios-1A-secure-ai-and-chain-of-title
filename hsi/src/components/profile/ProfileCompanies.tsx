import { Link } from 'react-router-dom';
import type { CreatedPage } from './types';
import { blobUrl } from '../../blobUrl';

/** The company pages this person manages. Owners also get the way to add one. */
export function ProfileCompanies({ pages, isOwner }: { pages: CreatedPage[]; isOwner: boolean }) {
  const companies = pages.filter(p => p.type === 'company');
  if (companies.length === 0 && !isOwner) return null;

  return (
    <div className="net-card prof-sidebar-card">
      <div className="prof-sidebar-header">
        <h4>Companies</h4>
        {companies.length > 0 && <span className="prof-sidebar-count">{companies.length}</span>}
      </div>
      <div className="co-mini-list">
        {companies.map(c => (
          <Link key={c.id} to={`/company/${c.slug}`} className="co-mini">
            <span className="co-mini-logo">
              {c.image_url ? <img src={blobUrl(c.image_url)} alt="" /> : c.title.charAt(0)}
            </span>
            <span className="co-mini-name">{c.title}</span>
          </Link>
        ))}
      </div>
      {isOwner && (
        <Link to="/company/new" className="btn btn-secondary btn-sm btn-block co-mini-create">
          {companies.length ? 'Create another company page' : 'Create a company page'}
        </Link>
      )}
    </div>
  );
}
