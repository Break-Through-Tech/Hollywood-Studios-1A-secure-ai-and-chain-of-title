import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FeaturedProfiles } from './FeaturedProfiles';
import { Avatar } from './Avatar';

interface Person {
  id: number;
  handle: string;
  display_name: string;
  headline: string | null;
  avatar_url: string | null;
  skills: string[];
  location: string | null;
  connection_status: 'none' | 'pending' | 'accepted';
  request_direction: 'sent' | 'received' | null;
  relevance: number;
  /** Public reference entry, not a member account — browsable but not connectable. */
  is_directory?: boolean;
  department?: string | null;
  credit_count?: number;
}

const DIRECTORY_PAGE = 24;

const email = () => localStorage.getItem('hsi-user-email') || '';

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [directory, setDirectory] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState<string>('All');
  const [shown, setShown] = useState(DIRECTORY_PAGE);
  const [acting, setActing] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadPeople();
  }, []);

  async function loadPeople() {
    try {
      const res = await fetch('/api/people/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email() }),
      });
      if (res.ok) {
        const data = await res.json();
        setPeople(data.people || []);
        setDirectory(data.directory || []);
      }
    } catch { /* */ }
    setLoading(false);
  }

  async function sendRequest(targetId: number) {
    setActing(prev => new Set(prev).add(targetId));
    try {
      const res = await fetch('/api/people/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email(), targetId }),
      });
      if (res.ok) {
        setPeople(prev => prev.map(p =>
          p.id === targetId ? { ...p, connection_status: 'pending', request_direction: 'sent' } : p
        ));
      }
    } catch { /* */ }
    setActing(prev => { const s = new Set(prev); s.delete(targetId); return s; });
  }

  async function respondRequest(fromProfileId: number, action: 'accept' | 'decline') {
    setActing(prev => new Set(prev).add(fromProfileId));
    try {
      const res = await fetch('/api/people/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email(), fromProfileId, action }),
      });
      if (res.ok) {
        setPeople(prev => prev.map(p => {
          if (p.id !== fromProfileId) return p;
          if (action === 'accept') return { ...p, connection_status: 'accepted', request_direction: null };
          return { ...p, connection_status: 'none', request_direction: null };
        }));
      }
    } catch { /* */ }
    setActing(prev => { const s = new Set(prev); s.delete(fromProfileId); return s; });
  }

  const matches = (p: Person) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.display_name.toLowerCase().includes(q)
      || (p.headline || '').toLowerCase().includes(q)
      || (p.skills || []).some(s => s.toLowerCase().includes(q))
      || (p.location || '').toLowerCase().includes(q);
  };

  const filtered = people.filter(matches);
  const departments = ['All', ...Array.from(new Set(directory.map(d => d.department).filter(Boolean) as string[])).sort()];
  const filteredDirectory = directory.filter(p => matches(p) && (dept === 'All' || p.department === dept));
  const visibleDirectory = filteredDirectory.slice(0, shown);

  const incoming = filtered.filter(p => p.request_direction === 'received');
  const connected = filtered.filter(p => p.connection_status === 'accepted');
  const closeToYou = filtered.filter(p => p.connection_status !== 'accepted' && p.request_direction !== 'received' && p.relevance > 0);
  const discover = filtered.filter(p => p.connection_status !== 'accepted' && p.request_direction !== 'received' && p.relevance === 0);

  return (
    <div className="ppl-page">
      <div className="ppl-content">
        <div className="ppl-header">
          <div>
            <h1 className="ppl-title">People</h1>
            <p className="ppl-subtitle">Connect with creators and industry professionals</p>
          </div>
          <div className="ppl-search-wrap">
            <svg className="ppl-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="ppl-search"
              placeholder="Search by name, skill, or location..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <FeaturedProfiles />

        {loading ? (
          <div className="ppl-loading">
            {[...Array(6)].map((_, i) => <div key={i} className="ppl-card-skeleton" />)}
          </div>
        ) : (
          <>
            {incoming.length > 0 && (
              <Section title="Requests" count={incoming.length} accent>
                {incoming.map(p => (
                  <PersonCard key={p.id} person={p} acting={acting.has(p.id)} onRespond={respondRequest} />
                ))}
              </Section>
            )}

            {connected.length > 0 && (
              <Section title="Your Connections" count={connected.length}>
                {connected.map(p => (
                  <PersonCard key={p.id} person={p} acting={acting.has(p.id)} />
                ))}
              </Section>
            )}

            {closeToYou.length > 0 && (
              <Section title="Similar to You" count={closeToYou.length}>
                {closeToYou.map(p => (
                  <PersonCard key={p.id} person={p} acting={acting.has(p.id)} onConnect={sendRequest} onRespond={respondRequest} />
                ))}
              </Section>
            )}

            {discover.length > 0 && (
              <Section title="Discover" count={discover.length}>
                {discover.map(p => (
                  <PersonCard key={p.id} person={p} acting={acting.has(p.id)} onConnect={sendRequest} onRespond={respondRequest} />
                ))}
              </Section>
            )}

            {filteredDirectory.length > 0 && (
              <div className="ppl-section">
                <div className="ppl-section-header">
                  <h2 className="ppl-section-title">Industry Directory</h2>
                  <span className="ppl-section-count">{filteredDirectory.length}</span>
                </div>
                <p className="ppl-section-note">
                  Public reference profiles compiled from Wikidata, Wikipedia and IMDb — not member accounts.
                </p>
                {departments.length > 2 && (
                  <div className="ppl-dept-filters">
                    {departments.map(d => (
                      <button
                        key={d}
                        className={`chip chip-btn ${dept === d ? 'on' : ''}`}
                        onClick={() => { setDept(d); setShown(DIRECTORY_PAGE); }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ppl-grid">
                  {visibleDirectory.map(p => (
                    <PersonCard key={p.id} person={p} acting={false} />
                  ))}
                </div>
                {visibleDirectory.length < filteredDirectory.length && (
                  <button className="btn btn-secondary ppl-show-more" onClick={() => setShown(n => n + DIRECTORY_PAGE)}>
                    Show more ({filteredDirectory.length - visibleDirectory.length} remaining)
                  </button>
                )}
              </div>
            )}

            {filtered.length === 0 && filteredDirectory.length === 0 && !loading && (
              <div className="ppl-empty">
                <p>No people found{search ? ' matching your search' : ''}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, accent, children }: {
  title: string; count: number; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="ppl-section">
      <div className="ppl-section-header">
        <h2 className="ppl-section-title">{title}</h2>
        <span className={`ppl-section-count ${accent ? 'ppl-section-count--accent' : ''}`}>{count}</span>
      </div>
      <div className="ppl-grid">{children}</div>
    </div>
  );
}

function PersonCard({ person: p, acting, onConnect, onRespond }: {
  person: Person;
  acting: boolean;
  onConnect?: (id: number) => void;
  onRespond?: (id: number, action: 'accept' | 'decline') => void;
}) {
  const skills = Array.isArray(p.skills) ? p.skills.slice(0, 4) : [];
  const isConnected = p.connection_status === 'accepted';
  const pendingSent = p.connection_status === 'pending' && p.request_direction === 'sent';
  const pendingReceived = p.request_direction === 'received';

  return (
    <div className="ppl-card">
      <Link to={`/profile/${p.handle}`} className="ppl-card-link">
        <div className="ppl-card-top">
          <Avatar name={p.display_name} src={p.avatar_url} size={44} />
          <div className="ppl-card-info">
            <span className="ppl-card-name">
              {p.display_name}
              {p.is_directory && <span className="chip">Reference</span>}
            </span>
            <span className="ppl-card-handle">
              {p.is_directory && p.credit_count ? `${p.department || 'Film'} · ${p.credit_count} credits` : `@${p.handle}`}
            </span>
          </div>
        </div>
        {p.headline && <p className="ppl-card-headline">{p.headline}</p>}
        {p.location && (
          <div className="ppl-card-location">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {p.location}
          </div>
        )}
      </Link>

      {skills.length > 0 && (
        <div className="ppl-card-skills">
          {skills.map(s => <span key={s} className="chip">{s}</span>)}
          {(p.skills || []).length > 4 && <span className="chip">+{p.skills.length - 4}</span>}
        </div>
      )}

      <div className="ppl-card-actions">
        {isConnected && (
          <span className="chip chip-good">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Connected
          </span>
        )}
        {pendingSent && (
          <span className="chip chip-warn">Pending</span>
        )}
        {pendingReceived && onRespond && (
          <div className="ppl-respond-row">
            <button className="btn btn-primary btn-sm" disabled={acting} onClick={() => onRespond(p.id, 'accept')}>Accept</button>
            <button className="btn btn-secondary btn-sm" disabled={acting} onClick={() => onRespond(p.id, 'decline')}>Decline</button>
          </div>
        )}
        {!isConnected && !pendingSent && !pendingReceived && onConnect && (
          <button className="btn btn-secondary btn-sm btn-connect" disabled={acting} onClick={() => onConnect(p.id)}>
            {acting ? 'Sending...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}
