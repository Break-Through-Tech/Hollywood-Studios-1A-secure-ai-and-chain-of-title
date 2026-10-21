import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CompanyData, CompanyPerson } from './types';
import { SOCIALS, categoryLabel, organizationTypeLabel, sizeLabel, formatFounded, displayHost } from './fields';
import { TYPE_ROUTES } from '../entity/types';
import { Avatar } from '../Avatar';
import { blobUrl } from '../../blobUrl';

function formatSpan(p: CompanyPerson) {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (p.is_current) return p.start_date ? `Since ${fmt(p.start_date)}` : 'Current';
  return p.start_date && p.end_date ? `${fmt(p.start_date)} — ${fmt(p.end_date)}` : 'Former';
}

export function CompanyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const [prevSlug, setPrevSlug] = useState(slug);
  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setLoading(true);
    setData(null);
    setNotFound(false);
    setAboutOpen(false);
  }

  // Record the visit so Projects can rank by real traffic; never block the page on it.
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
      if (res.ok) return res.json().then((json: CompanyData) => {
        if (ignore) return;
        if (json.entity.type !== 'company') { setNotFound(true); return; }
        setData(json);
      });
    }).catch(() => {}).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="prof-loading">
        <div className="prof-loading-pulse" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="empty" style={{ flex: 1 }}>
        <h3>Company not found</h3>
        <Link to="/people" className="btn btn-ghost btn-sm">Back to People</Link>
      </div>
    );
  }

  const { entity, owner, people, notableWork, canEdit } = data;
  const c = data.company;
  const category = categoryLabel(c?.category);
  const founded = formatFounded(entity.year, c?.founded_month ?? null);
  const socials = SOCIALS.filter(s => c?.social_links?.[s.key]);
  const current = people.filter(p => p.is_current);
  const former = people.filter(p => !p.is_current);
  const about = entity.description || '';
  const longAbout = about.length > 600;

  const overview: [string, React.ReactNode][] = [];
  if (c?.website) overview.push(['Website', <a href={c.website} target="_blank" rel="noopener noreferrer">{displayHost(c.website)}</a>]);
  if (category) overview.push(['Industry', category]);
  if (sizeLabel(c?.company_size)) overview.push(['Company size', sizeLabel(c?.company_size)]);
  if (c?.headquarters) overview.push(['Headquarters', c.headquarters]);
  if (founded) overview.push(['Founded', founded]);
  if (organizationTypeLabel(c?.organization_type)) overview.push(['Type', organizationTypeLabel(c?.organization_type)]);
  if (c?.contact_email) overview.push(['Email', <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>]);
  if (c?.phone) overview.push(['Phone', <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>{c.phone}</a>]);

  return (
    <div className="prof-layout co-layout" style={{ overflow: 'auto', height: '100vh' }}>
      <div className="prof-primary">
        <header className="co-hero">
          <div className="co-cover">
            {c?.cover_url && <img src={blobUrl(c.cover_url)} alt="" />}
          </div>
          <div className="co-hero-body">
            <div className="co-logo">
              {entity.image_url
                ? <img src={blobUrl(entity.image_url)} alt={`${entity.title} logo`} />
                : <span aria-hidden="true">{entity.title.charAt(0)}</span>}
            </div>
            <div className="co-hero-actions">
              {c?.website && (
                <a className="btn btn-secondary btn-sm" href={c.website} target="_blank" rel="noopener noreferrer">
                  Visit website
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                </a>
              )}
              {canEdit && <Link className="btn btn-primary btn-sm" to={`/company/${entity.slug}/edit`}>Edit page</Link>}
            </div>
            <h1 className="co-name">{entity.title}</h1>
            {c?.tagline && <p className="co-tagline">{c.tagline}</p>}
            <div className="co-meta">
              {category && <span>{category}</span>}
              {c?.headquarters && <span>{c.headquarters}</span>}
              {sizeLabel(c?.company_size) && <span>{sizeLabel(c?.company_size)}</span>}
              {founded && <span>Since {founded}</span>}
            </div>
            {people.length > 0 && (
              <div className="co-hero-people">
                <div className="co-avatar-stack">
                  {(current.length > 0 ? current : people).slice(0, 4).map(p =><Avatar key={p.handle} name={p.display_name} src={p.avatar_url} size={26} />)}
                </div>
                <span>{current.length > 0 ? `${current.length} ${current.length === 1 ? 'person works' : 'people work'} here on HSI` : `${people.length} ${people.length === 1 ? 'person has' : 'people have'} worked here`}</span>
              </div>
            )}
          </div>
        </header>

        <section className="net-card prof-section">
          <h3 className="prof-section-title co-section-title">About</h3>
          {about ? (
            <>
              <p className={`co-about ${longAbout && !aboutOpen ? 'co-about--clamped' : ''}`}>{about}</p>
              {longAbout && (
                <button className="prof-hero-about-toggle" onClick={() => setAboutOpen(o => !o)}>
                  {aboutOpen ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <p className="prof-empty">{canEdit ? 'Tell people what this company does — edit the page to add an overview.' : 'No overview yet.'}</p>
          )}
          {c && c.specialties.length > 0 && (
            <>
              <h4 className="label co-sublabel">Specialties</h4>
              <div className="prof-skills-list">
                {c.specialties.map(s => <span key={s} className="chip">{s}</span>)}
              </div>
            </>
          )}
        </section>

        {notableWork.length > 0 && (
          <section className="net-card prof-section">
            <h3 className="prof-section-title co-section-title">Notable work</h3>
            <div className="prof-known-grid">
              {notableWork.map(w => (
                <Link key={w.id} to={`${TYPE_ROUTES[w.type]}/${w.slug}`} className="prof-known-card">
                  {w.image_url
                    ? <img src={blobUrl(w.image_url) || w.image_url} alt="" className="prof-known-img" />
                    : <div className="prof-known-placeholder">{w.title.charAt(0)}</div>}
                  <div className="prof-known-info">
                    <span className="prof-known-title">{w.title}</span>
                    {w.year && <span className="prof-known-year">{w.year}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="net-card prof-section">
          <div className="prof-section-header">
            <h3 className="prof-section-title">People</h3>
            {people.length > 0 && <span className="mono faint">{people.length}</span>}
          </div>
          {people.length === 0 ? (
            <p className="prof-empty">
              No one has linked this company yet. Members appear here when they add it to the Experience section of their profile.
            </p>
          ) : (
            <>
              <PeopleList people={current} />
              {former.length > 0 && (
                <>
                  <h4 className="label co-sublabel">Formerly</h4>
                  <PeopleList people={former} />
                </>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="prof-sidebar">
        {overview.length > 0 && (
          <div className="net-card prof-section">
            <h3 className="prof-section-title co-section-title">Overview</h3>
            <dl className="co-overview">
              {overview.map(([label, value]) => (
                <div key={label} className="co-overview-row">
                  <dt className="ent-detail-label">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {socials.length > 0 && (
          <div className="net-card prof-section">
            <h3 className="prof-section-title co-section-title">Elsewhere</h3>
            <div className="co-socials">
              {socials.map(s => (
                <a key={s.key} className="chip chip-btn" href={c!.social_links[s.key]} target="_blank" rel="noopener noreferrer">{s.label}</a>
              ))}
            </div>
          </div>
        )}

        {owner && (
          <div className="net-card prof-section">
            <h3 className="prof-section-title co-section-title">Page managed by</h3>
            <Link to={`/profile/${owner.handle}`} className="co-person">
              <Avatar name={owner.display_name} src={owner.avatar_url} size={40} />
              <span className="co-person-info">
                <span className="co-person-name">{owner.display_name}</span>
                {owner.headline && <span className="co-person-role">{owner.headline}</span>}
              </span>
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

function PeopleList({ people }: { people: CompanyPerson[] }) {
  return (
    <div className="co-people">
      {people.map(p => (
        <Link key={p.handle} to={`/profile/${p.handle}`} className="co-person">
          <Avatar name={p.display_name} src={p.avatar_url} size={40} />
          <span className="co-person-info">
            <span className="co-person-name">{p.display_name}</span>
            <span className="co-person-role">{p.job_title}</span>
            <span className="co-person-span">{formatSpan(p)}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
