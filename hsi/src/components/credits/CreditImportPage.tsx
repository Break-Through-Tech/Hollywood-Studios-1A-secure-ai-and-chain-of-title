import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CreditSuggestion, NewCredit, ResearchResponse } from '../../../api/profile/credits/_suggestions';

/**
 * /credits/import — find a member's public credits with the research agent,
 * let them confirm or remove each one, then append the confirmed ones to
 * their profile. Opened after sign-up (?welcome=1) or from the profile's
 * Credits section (?from=/profile/<handle>).
 */

type Step = 'start' | 'searching' | 'review' | 'done';
type Decision = 'confirmed' | 'removed';

function getLoggedInEmail() { return localStorage.getItem('hsi-user-email') || ''; }

/** Only same-site paths, so ?from= can't send people elsewhere. */
function safePath(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

export function CreditImportPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const email = getLoggedInEmail();

  const [me, setMe] = useState<{ handle: string | null }>({ handle: null });
  const [step, setStep] = useState<Step>('start');
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [consent, setConsent] = useState(false);
  const [suggestions, setSuggestions] = useState<CreditSuggestion[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const profilePath = me.handle ? `/profile/${me.handle}` : null;
  const exitPath = safePath(params.get('from')) ?? (welcome ? '/network' : profilePath ?? '/network');

  useEffect(() => {
    if (!email) { navigate('/login'); return; }
    let on = true;
    postJson<{ profile?: { handle?: string; display_name?: string } }>('/api/settings/account/get', { email })
      .then((d) => {
        if (!on) return;
        setMe({ handle: d.profile?.handle ?? null });
        setName((current) => current || d.profile?.display_name || '');
      })
      .catch(() => { /* name stays empty; the member types it */ });
    return () => { on = false; abortRef.current?.abort(); };
  }, [email, navigate]);

  const selectable = (suggestions ?? []).filter((s) => !s.alreadyOnProfile);
  const confirmed = selectable.filter((s) => decisions[s.id] === 'confirmed');
  const removedCount = selectable.filter((s) => decisions[s.id] === 'removed').length;
  const undecided = selectable.length - confirmed.length - removedCount;

  function exit() {
    if (step === 'review' && confirmed.length > 0 &&
        !window.confirm(`Leave without saving ${confirmed.length} confirmed credit${confirmed.length === 1 ? '' : 's'}?`)) return;
    navigate(exitPath);
  }

  function goBack() {
    setError('');
    if (step === 'review') { setStep('start'); return; }
    if (step === 'searching') { abortRef.current?.abort(); setStep('start'); return; }
    // First step: back to wherever the member came from.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(exitPath);
  }

  async function search() {
    setError('');
    setStep('searching');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await postJson<ResearchResponse>('/api/profile/credits/research', { email, name, hint }, controller.signal);
      setSuggestions(data.suggestions);
      setDecisions({});
      setStep('review');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setStep('start');
    }
  }

  function decide(id: string, decision: Decision) {
    setDecisions((d) => {
      const next = { ...d };
      if (next[id] === decision) delete next[id]; // clicking again undoes it
      else next[id] = decision;
      return next;
    });
  }

  function decideAll(decision: Decision) {
    setDecisions(Object.fromEntries(selectable.map((s) => [s.id, decision])));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const credits: NewCredit[] = confirmed.map(({ title, year, role, workType, department }) => ({ title, year, role, workType, department }));
      const data = await postJson<{ added: number }>('/api/profile/credits/add', { email, credits });
      setAdded(data.added);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ci-page">
      <div className="ci-content">
        {step !== 'done' && (
          <div className="ci-steps label" aria-label="Progress">
            <span className={step === 'review' ? '' : 'ci-step-on'}>1 · Find</span>
            <span className="ci-steps-sep" />
            <span className={step === 'review' ? 'ci-step-on' : ''}>2 · Review</span>
          </div>
        )}

        {(step === 'start' || step === 'searching') && (
          <div className="net-card ci-card">
            <h1 className="ci-title">{welcome ? 'Welcome! Let’s add your credits' : 'Find your credits'}</h1>
            <p className="ci-lede">
              We can search public websites for credits under your name. You choose which ones to keep —
              nothing is added to your profile until you confirm it.
            </p>

            <label className="prof-field-label" htmlFor="ci-name">Your name as it appears in credits</label>
            <input id="ci-name" className="app-input" value={name} disabled={step === 'searching'}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" />

            <label className="prof-field-label ci-gap" htmlFor="ci-hint">Something that identifies you <span className="faint">(optional)</span></label>
            <input id="ci-hint" className="app-input" value={hint} disabled={step === 'searching'}
              onChange={(e) => setHint(e.target.value)} placeholder="e.g. director, Lady Bird — or a show you worked on" />
            <p className="ci-help">Helps tell you apart from other people with the same name.</p>

            <label className="ci-consent">
              <input type="checkbox" checked={consent} disabled={step === 'searching'} onChange={(e) => setConsent(e.target.checked)} />
              <span>I give HSI permission to search public websites for my name and work history.
                Sites that don’t allow automated collection (like IMDb and LinkedIn) are skipped.</span>
            </label>

            {error && <p className="login-error ci-error" role="alert">{error}</p>}

            {step === 'searching' ? (
              <div className="ci-searching" role="status">
                <span className="ci-spinner" />
                <span>Searching public sources… this usually takes 15–30 seconds.</span>
              </div>
            ) : null}

            <div className="ci-actions">
              <button className="btn btn-ghost" onClick={goBack}>{step === 'searching' ? 'Cancel' : 'Back'}</button>
              <span className="ci-spacer" />
              <button className="btn btn-secondary" onClick={exit}>Skip for now</button>
              {suggestions && step === 'start' && (
                <button className="btn btn-secondary" onClick={() => setStep('review')}>Back to results</button>
              )}
              <button className="btn btn-primary" onClick={search}
                disabled={step === 'searching' || !consent || name.trim().length < 2}>
                {step === 'searching' ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {step === 'review' && suggestions && (
          <div className="net-card ci-card">
            <h1 className="ci-title">Review your credits</h1>
            {suggestions.length === 0 ? (
              <div className="empty ci-empty">
                <h3>No credits found for “{name.trim()}”</h3>
                <p>Try a more specific hint, like a title you worked on, or add your credits by hand on your profile.</p>
              </div>
            ) : (
              <>
                <p className="ci-lede">
                  We found {suggestions.length} possible credit{suggestions.length === 1 ? '' : 's'}.
                  Confirm the ones that are yours and remove the rest. Check the source if you’re unsure.
                </p>

                <div className="ci-toolbar">
                  <button className="btn btn-sm btn-secondary" onClick={() => decideAll('confirmed')} disabled={selectable.length === 0}>Confirm all</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => decideAll('removed')} disabled={selectable.length === 0}>Reject all</button>
                  <span className="ci-spacer" />
                  <span className="ci-tally mono">{confirmed.length} confirmed · {removedCount} removed · {undecided} to review</span>
                </div>

                <ul className="ci-list">
                  {suggestions.map((s) => {
                    const d = s.alreadyOnProfile ? undefined : decisions[s.id];
                    return (
                      <li key={s.id} className={`ci-item${d ? ` ci-item--${d}` : ''}${s.alreadyOnProfile ? ' ci-item--saved' : ''}`}>
                        <div className="ci-item-main">
                          <div className="ci-item-head">
                            <span className="ci-item-title">{s.title}</span>
                            <span className="ci-item-year mono">{s.year ?? '—'}</span>
                          </div>
                          <div className="ci-item-meta">{[s.role, s.workType, s.department].filter(Boolean).join(' · ')}</div>
                          <div className="ci-item-source">
                            Source: <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{hostname(s.sourceUrl)}</a>
                          </div>
                          {(s.needsReview || s.alreadyOnProfile) && (
                            <div className="ci-item-flags">
                              {s.needsReview && <span className="chip chip-warn" title={s.reason ?? undefined}>Check this: {s.reason}</span>}
                              {s.alreadyOnProfile && <span className="chip chip-good">Already on your profile</span>}
                            </div>
                          )}
                        </div>
                        {!s.alreadyOnProfile && (
                          <div className="ci-item-actions">
                            <button className={`btn btn-sm ${d === 'confirmed' ? 'btn-primary' : 'btn-secondary'}`}
                              aria-pressed={d === 'confirmed'} onClick={() => decide(s.id, 'confirmed')}>
                              {d === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
                            </button>
                            <button className={`btn btn-sm ${d === 'removed' ? 'btn-danger ci-btn-removed' : 'btn-ghost'}`}
                              aria-pressed={d === 'removed'} onClick={() => decide(s.id, 'removed')}>
                              {d === 'removed' ? 'Removed' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {error && <p className="login-error ci-error" role="alert">{error}</p>}

            <div className="ci-actions ci-actions--sticky">
              <button className="btn btn-ghost" onClick={goBack}>Back</button>
              <span className="ci-spacer" />
              <button className="btn btn-secondary" onClick={exit}>Skip for now</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || confirmed.length === 0}>
                {saving ? 'Saving…' : confirmed.length ? `Save ${confirmed.length} credit${confirmed.length === 1 ? '' : 's'}` : 'Save credits'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="net-card ci-card ci-done">
            <h1 className="ci-title">{added > 0 ? `Added ${added} credit${added === 1 ? '' : 's'} to your profile` : 'Nothing new to add'}</h1>
            <p className="ci-lede">You can edit or remove credits any time from the Credits section of your profile.</p>
            <div className="ci-actions">
              <span className="ci-spacer" />
              {profilePath && <Link className="btn btn-secondary" to={profilePath}>View profile</Link>}
              <button className="btn btn-primary" onClick={() => navigate(exitPath)}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
