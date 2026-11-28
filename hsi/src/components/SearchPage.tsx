import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { blobUrl } from '../blobUrl';
import { Avatar } from './Avatar';

interface ProfileResult {
  id: number;
  handle: string;
  display_name: string;
  headline: string | null;
  avatar_url: string | null;
  is_directory?: boolean;
  credit_count?: number;
}

interface EntityResult {
  id: number;
  type: string;
  title: string;
  slug: string;
  year: number | null;
  image_url: string | null;
}

function EntityThumb({ entity }: { entity: EntityResult }) {
  if (entity.image_url) return <img src={blobUrl(entity.image_url)} alt="" className="search-thumb" loading="lazy" />;
  const icons: Record<string, string> = { movie: '🎬', tvshow: '📺', music: '🎵', company: '🏢' };
  return <div className="search-thumb search-thumb--empty">{icons[entity.type] || ''}</div>;
}

function PersonRow({ p }: { p: ProfileResult }) {
  return (
    <Link to={`/profile/${p.handle}`} className="search-result-item">
      <Avatar name={p.display_name || p.handle} src={p.avatar_url} size={44} />
      <div className="search-result-info">
        <span className="search-result-name">
          {p.display_name}
          {p.is_directory && <span className="chip">Reference</span>}
        </span>
        <span className="search-result-sub">
          {p.headline || `@${p.handle}`}
          {p.credit_count ? ` · ${p.credit_count} credits` : ''}
        </span>
      </div>
    </Link>
  );
}

const TYPE_LABELS: Record<string, string> = { movie: 'Movies', tvshow: 'Shows', music: 'Music', company: 'Companies' };
const TYPE_ORDER = ['movie', 'tvshow', 'music', 'company'];

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<ProfileResult[]>([]);
  const [entities, setEntities] = useState<EntityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<{ profiles: ProfileResult[]; actors: ProfileResult[]; entities: EntityResult[] }>({ profiles: [], actors: [], entities: [] });
  const [trendingLoaded, setTrendingLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/search/trending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (res.ok) {
          const data = await res.json();
          setTrending({ profiles: data.profiles || [], actors: data.actors || [], entities: data.entities || [] });
        }
      } catch { /* ignore */ }
      setTrendingLoaded(true);
    })();
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setProfiles([]);
      setEntities([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/search/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }) });
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
        setEntities(data.entities || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  }

  const hasQuery = query.trim().length > 0;
  const hasResults = profiles.length > 0 || entities.length > 0;
  const groupedEntities = TYPE_ORDER.map(type => ({ type, label: TYPE_LABELS[type], items: entities.filter(e => e.type === type) })).filter(g => g.items.length > 0);
  const trendingGrouped = TYPE_ORDER.map(type => ({ type, label: TYPE_LABELS[type], items: trending.entities.filter(e => e.type === type) })).filter(g => g.items.length > 0);

  return (
    <div className="search-page">
      <div className="search-container">
        <div className="search-bar-wrap">
          <svg className="search-bar-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
          <input
            ref={inputRef}
            type="text"
            className="search-bar-input"
            placeholder="Search people, movies, shows, music..."
            value={query}
            onChange={handleChange}
          />
          {query && (
            <button className="search-bar-clear" onClick={() => { setQuery(''); setProfiles([]); setEntities([]); inputRef.current?.focus(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        {loading && (
          <div className="search-loading">
            <div className="search-loading-dot" />
            <div className="search-loading-dot" />
            <div className="search-loading-dot" />
          </div>
        )}

        {hasQuery && !loading && !hasResults && (
          <div className="search-empty">
            <p>No results for "<strong>{query}</strong>"</p>
          </div>
        )}

        {hasQuery && hasResults && (
          <div className="search-results">
            {profiles.length > 0 && (
              <div className="search-group">
                <h3 className="search-group-label">People</h3>
                <div className="search-group-list">
                  {profiles.map(p => <PersonRow key={p.id} p={p} />)}
                </div>
              </div>
            )}

            {groupedEntities.map(group => (
              <div key={group.type} className="search-group">
                <h3 className="search-group-label">{group.label}</h3>
                <div className="search-group-list">
                  {group.items.map(e => (
                    <Link key={e.id} to={`/${e.type}/${e.slug}`} className="search-result-item">
                      <EntityThumb entity={e} />
                      <div className="search-result-info">
                        <span className="search-result-name">{e.title}</span>
                        <span className="search-result-sub">{e.year || ''}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasQuery && trendingLoaded && (
          <div className="search-results search-trending">
            <h2 className="search-trending-heading">Trending</h2>

            {trending.profiles.length > 0 && (
              <div className="search-group">
                <h3 className="search-group-label">People</h3>
                <div className="search-group-list">
                  {trending.profiles.map(p => <PersonRow key={p.id} p={p} />)}
                </div>
              </div>
            )}

            {trending.actors.length > 0 && (
              <div className="search-group">
                <h3 className="search-group-label">Industry Directory</h3>
                <div className="search-group-list">
                  {trending.actors.map(p => <PersonRow key={p.id} p={p} />)}
                </div>
              </div>
            )}

            {trendingGrouped.map(group => (
              <div key={group.type} className="search-group">
                <h3 className="search-group-label">{group.label}</h3>
                <div className="search-group-list">
                  {group.items.map(e => (
                    <Link key={e.id} to={`/${e.type}/${e.slug}`} className="search-result-item">
                      <EntityThumb entity={e} />
                      <div className="search-result-info">
                        <span className="search-result-name">{e.title}</span>
                        <span className="search-result-sub">{e.year || ''}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {trending.profiles.length === 0 && trending.actors.length === 0 && trending.entities.length === 0 && (
              <div className="search-empty">
                <p>Start typing to search</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
