import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { blobUrl } from '../blobUrl';

interface Project {
  id: number;
  title: string;
  slug: string;
  year: number | null;
  image_url: string | null;
  genre: string[] | null;
  credit_count?: number;
  views?: number;
}

interface Overview {
  trending: Project[];
  trendingBasis: 'views' | 'none';
  featured: Project[];
  recent: Project[];
  genres: { name: string; n: number }[];
  browse: Project[];
  totals: { titles: number; with_art: number; credits: number; people: number };
}

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960];

function Poster({ p, size = 'md' }: { p: Project; size?: 'md' | 'lg' }) {
  const src = p.image_url ? blobUrl(p.image_url) : null;
  return (
    <Link to={`/movie/${p.slug}`} className={`proj-card proj-card--${size}`}>
      <div className="proj-poster">
        {src ? (
          <img src={src} alt={p.title} loading="lazy" />
        ) : (
          <div className="proj-poster-empty" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
            </svg>
          </div>
        )}
        {typeof p.views === 'number' && p.views > 0 && (
          <span className="proj-views">{p.views} {p.views === 1 ? 'view' : 'views'}</span>
        )}
      </div>
      <span className="proj-title">{p.title}</span>
      <span className="proj-meta">
        {p.year || '—'}
        {p.credit_count ? ` · ${p.credit_count} credits` : ''}
      </span>
    </Link>
  );
}

function Row({ title, note, items, size }: { title: string; note?: string; items: Project[]; size?: 'md' | 'lg' }) {
  if (items.length === 0) return null;
  return (
    <section className="proj-section">
      <div className="proj-section-head">
        <h2 className="proj-section-title">{title}</h2>
        {note && <span className="proj-section-note">{note}</span>}
      </div>
      <div className="proj-rail">
        {items.map(p => <Poster key={p.id} p={p} size={size} />)}
      </div>
    </section>
  );
}

export function ProjectsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState<string | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async (filters: { genre?: string | null; decade?: number | null; query?: string }, isBrowse = false) => {
    if (isBrowse) setBrowsing(true);
    try {
      const res = await fetch('/api/entity/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre: filters.genre ?? null, decade: filters.decade ?? null, query: filters.query || null }),
      });
      if (res.ok) {
        const json: Overview = await res.json();
        setData(prev => (isBrowse && prev ? { ...prev, browse: json.browse } : json));
      }
    } catch { /* ignore */ }
    setLoading(false);
    setBrowsing(false);
  }, []);

  // Initial load is its own effect so nothing sets state synchronously on mount,
  // and so a fast unmount can't write into a dead component.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/entity/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const json: Overview = await res.json();
          if (!cancelled) setData(json);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function applyFilters(next: { genre?: string | null; decade?: number | null; query?: string }) {
    const merged = {
      genre: next.genre !== undefined ? next.genre : genre,
      decade: next.decade !== undefined ? next.decade : decade,
      query: next.query !== undefined ? next.query : query,
    };
    if (next.genre !== undefined) setGenre(next.genre);
    if (next.decade !== undefined) setDecade(next.decade);
    if (next.query !== undefined) setQuery(next.query);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(merged, true), next.query !== undefined ? 250 : 0);
  }

  if (loading) {
    return (
      <div className="proj-page">
        <div className="proj-content">
          <div className="proj-skeleton-rail">{[...Array(6)].map((_, i) => <div key={i} className="proj-skeleton" />)}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="proj-page"><div className="proj-content"><p className="proj-empty">Couldn't load projects.</p></div></div>;
  }

  const hasFilters = genre !== null || decade !== null || query.trim() !== '';

  return (
    <div className="proj-page">
      <div className="proj-content">
        <header className="proj-header">
          <div>
            <h1 className="proj-title-main">Projects</h1>
            <p className="proj-subtitle">
              {data.totals.titles.toLocaleString()} titles · {data.totals.credits.toLocaleString()} credits · {data.totals.people.toLocaleString()} people
            </p>
          </div>
        </header>

        {data.trendingBasis === 'views'
          ? <Row title="Trending Today" note="most viewed in the last 24 hours" items={data.trending} size="lg" />
          : (
            <section className="proj-section">
              <div className="proj-section-head">
                <h2 className="proj-section-title">Trending Today</h2>
                <span className="proj-section-note">no views recorded yet today — check back once pages are opened</span>
              </div>
            </section>
          )}

        <Row title="Featured" note="most connected to the directory" items={data.featured} size="lg" />
        <Row title="Recent Releases" items={data.recent} />

        <section className="proj-section">
          <div className="proj-section-head">
            <h2 className="proj-section-title">Browse</h2>
            {hasFilters && (
              <button className="proj-clear" onClick={() => { setGenre(null); setDecade(null); setQuery(''); load({}, true); }}>
                Clear filters
              </button>
            )}
          </div>

          <div className="proj-controls">
            <input
              className="input proj-search"
              placeholder="Search titles..."
              value={query}
              onChange={e => applyFilters({ query: e.target.value })}
            />
            <div className="proj-chips">
              {DECADES.map(d => (
                <button
                  key={d}
                  className={`chip chip-btn ${decade === d ? 'on' : ''}`}
                  onClick={() => applyFilters({ decade: decade === d ? null : d })}
                >
                  {d}s
                </button>
              ))}
            </div>
            <div className="proj-chips">
              {data.genres.map(g => (
                <button
                  key={g.name}
                  className={`chip chip-btn ${genre === g.name ? 'on' : ''}`}
                  onClick={() => applyFilters({ genre: genre === g.name ? null : g.name })}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {browsing ? (
            <div className="proj-grid">{[...Array(8)].map((_, i) => <div key={i} className="proj-skeleton" />)}</div>
          ) : data.browse.length === 0 ? (
            <p className="proj-empty">No titles match those filters.</p>
          ) : (
            <div className="proj-grid">
              {data.browse.map(p => <Poster key={p.id} p={p} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
