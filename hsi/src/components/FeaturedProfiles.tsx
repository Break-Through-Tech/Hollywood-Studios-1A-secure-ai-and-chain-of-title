import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TYPE_ROUTES } from './entity/types';
import { blobUrl } from '../blobUrl';

interface FeaturedCredit {
  title: string;
  year: number | null;
  role: string | null;
  work_type: string | null;
  entity_id: number | null;
  entity_type: string | null;
  entity_slug: string | null;
  entity_image_url: string | null;
}

export interface FeaturedProfile {
  id: number;
  handle: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  skills: string[];
  is_directory: boolean;
  source: string | null;
  source_url: string | null;
  blurb: string | null;
  credit_count: number;
  credits: FeaturedCredit[];
}

/** A bio is a paragraph; the card holds a sentence or two of it. */
const BLURB_LIMIT = 230;

function shorten(text: string, limit = BLURB_LIMIT) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return stop > limit * 0.5 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/** "Week of 2026-08-31" reads as a timestamp; the label people expect is the date. */
function weekLabel(weekStart: string | null): string | null {
  const [y, m, d] = (weekStart || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The hand-picked people at the top of /people. The cohort is whatever
 * set-featured.mjs last wrote, so a selection stays up until it is deliberately
 * changed — the week label records when it was chosen, it is not an expiry.
 */
export function FeaturedProfiles() {
  const [profiles, setProfiles] = useState<FeaturedProfile[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/people/featured')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setProfiles(data.profiles || []);
        setWeekStart(data.weekStart || null);
      })
      .catch(() => { /* the page reads fine without a spotlight */ });
    return () => { cancelled = true; };
  }, []);

  if (profiles.length === 0) return null;
  const label = weekLabel(weekStart);

  return (
    <section className="feat-section">
      <div className="feat-header">
        <h2 className="seal"><i>★</i> Featured this week</h2>
        {label && <span className="feat-week">Week of {label}</span>}
      </div>
      <div className={`feat-grid ${profiles.length === 1 ? 'feat-grid--single' : ''}`}>
        {profiles.map(p => <FeaturedCard key={p.id} profile={p} />)}
      </div>
    </section>
  );
}

function FeaturedCard({ profile: p }: { profile: FeaturedProfile }) {
  const note = p.blurb || (p.bio ? shorten(p.bio) : null);
  const meta = [p.location, p.credit_count ? `${p.credit_count} credits` : null].filter(Boolean) as string[];

  return (
    <article className="feat-card">
      <Link to={`/profile/${p.handle}`} className="feat-portrait-link" tabIndex={-1} aria-hidden="true">
        {p.avatar_url ? (
          <img src={blobUrl(p.avatar_url)} alt="" className="feat-portrait" loading="lazy" />
        ) : (
          <div className="feat-portrait feat-portrait--placeholder">{p.display_name.charAt(0)}</div>
        )}
      </Link>

      <div className="feat-body">
        <Link to={`/profile/${p.handle}`} className="feat-name-link">
          <h3 className="feat-name">
            {p.display_name}
            {p.is_directory && <span className="chip">Reference</span>}
          </h3>
        </Link>
        {p.headline && <p className="feat-headline">{p.headline}</p>}

        {meta.length > 0 && (
          <div className="feat-meta">
            {meta.map(m => <span key={m} className="feat-meta-item">{m}</span>)}
          </div>
        )}

        {note && <p className="feat-blurb">{note}</p>}

        {p.credits.length > 0 && (
          <div className="feat-credits">
            <span className="label feat-credits-label">Selected credits</span>
            <div className="feat-credit-list">
              {p.credits.map((c, i) => {
                const route = c.entity_type ? TYPE_ROUTES[c.entity_type] : null;
                const inner = (
                  <>
                    {c.entity_image_url ? (
                      <img src={blobUrl(c.entity_image_url)} alt="" className="feat-credit-poster" loading="lazy" title={`${c.title}${c.year ? ` (${c.year})` : ''}`} />
                    ) : (
                      <span className="feat-credit-poster feat-credit-poster--text" title={c.title}>{c.title.slice(0, 2)}</span>
                    )}
                    <span className="feat-credit-title">{c.title}</span>
                    <span className="feat-credit-year">{c.year || c.work_type}</span>
                  </>
                );
                return route && c.entity_slug ? (
                  <Link key={i} to={`${route}/${c.entity_slug}`} className="feat-credit feat-credit--link">
                    {inner}
                  </Link>
                ) : (
                  <span key={i} className="feat-credit">{inner}</span>
                );
              })}
            </div>
          </div>
        )}

        <div className="feat-actions">
          <Link to={`/profile/${p.handle}`} className="btn btn-primary btn-sm">View profile</Link>
          {p.source_url && (
            <a href={p.source_url} target="_blank" rel="noreferrer noopener" className="feat-source">
              {p.source === 'imdb' ? 'IMDb' : 'Source'} ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
