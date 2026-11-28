import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useViewTracking } from '../hooks/useViewTracking';

interface SharedMeta {
  title: string;
  ownerEmail: string;
  projectType: string;
  requireEmail: boolean;
  hasPasscode: boolean;
  hasAllowlist: boolean;
  ndaText: string | null;
  verifyEmail: boolean;
}

interface UnlockedDoc {
  content: string;
  sessionKey: string | null;
  allowDownload: boolean;
  watermarkText: string | null;
}

const PAGE_MAX_LINES = 50;
const PAGE_MAX_CHARS = 2800;

function paginate(content: string): string[] {
  const lines = content.split('\n');
  const pages: string[] = [];
  let current: string[] = [];
  let chars = 0;

  for (const line of lines) {
    if (current.length >= PAGE_MAX_LINES || (chars + line.length > PAGE_MAX_CHARS && current.length > 0)) {
      pages.push(current.join('\n'));
      current = [];
      chars = 0;
    }
    current.push(line);
    chars += line.length + 1;
  }
  if (current.length > 0) pages.push(current.join('\n'));
  return pages.length > 0 ? pages : [''];
}

function gateStorageKey(token: string) {
  return `hsi-view-gate-${token}`;
}

export function SharedViewPage() {
  const { token } = useParams();
  const [meta, setMeta] = useState<SharedMeta | null>(null);
  const [doc, setDoc] = useState<UnlockedDoc | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  const [gateStep, setGateStep] = useState<'identify' | 'verify' | 'nda'>('identify');
  const [gateEmail, setGateEmail] = useState('');
  const [gateName, setGateName] = useState('');
  const [gatePasscode, setGatePasscode] = useState('');
  const [gateCode, setGateCode] = useState('');
  const [codeSending, setCodeSending] = useState(false);
  const [gateError, setGateError] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [ndaAccepted, setNdaAccepted] = useState(false);

  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [sentNotes, setSentNotes] = useState<string[]>([]);

  const pagesRef = useRef<(HTMLDivElement | null)[]>([]);
  const autoTried = useRef(false);

  async function unlock(fields: { email?: string; name?: string; passcode?: string; signatureName?: string; code?: string }) {
    const res = await fetch('/api/vault/tracking/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...fields }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error || 'Unable to open this document'), {
        status: res.status,
        verificationRequired: !!data.verificationRequired,
      });
    }
    return data as UnlockedDoc;
  }

  async function sendVerifyCode(email: string) {
    setCodeSending(true);
    try {
      const res = await fetch('/api/vault/tracking/verify-viewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setGateError('');
      return true;
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Failed to send code');
      return false;
    } finally {
      setCodeSending(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetch('/api/vault/tracking/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'This link is unavailable');
        return data as SharedMeta;
      })
      .then(async m => {
        setMeta(m);
        let saved: { email?: string; name?: string; signatureName?: string } = {};
        try { saved = JSON.parse(sessionStorage.getItem(gateStorageKey(token)) || '{}'); } catch { /* fresh gate */ }
        if (saved.email) setGateEmail(saved.email);
        if (saved.name) setGateName(saved.name);
        if (saved.signatureName) setSignatureName(saved.signatureName);

        const needsIdentity = m.requireEmail || m.hasAllowlist;
        const canAuto = !m.hasPasscode
          && (!needsIdentity || !!saved.email)
          && (!m.ndaText || !!saved.signatureName);

        if (canAuto && !autoTried.current) {
          autoTried.current = true;
          try {
            const unlocked = await unlock({
              email: saved.email,
              name: saved.name,
              signatureName: m.ndaText ? saved.signatureName : undefined,
            });
            setDoc(unlocked);
          } catch { /* fall through to gate */ }
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : 'This link is unavailable'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const ready = !!doc;
  const { reportScroll, reportPage, getSessionKey } = useViewTracking({
    enabled: ready && !!doc?.sessionKey,
    sessionKey: doc?.sessionKey,
  });

  const pages = useMemo(() => doc ? paginate(doc.content) : [], [doc]);

  useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      reportScroll(max > 0 ? (window.scrollY / max) * 100 : 100);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ready, reportScroll]);

  useEffect(() => {
    if (!ready || pages.length === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) best = entry;
        }
        if (best) {
          const idx = Number((best.target as HTMLElement).dataset.page);
          if (!Number.isNaN(idx)) reportPage(idx, pages.length);
        }
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    pagesRef.current.forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [ready, pages.length, reportPage]);

  async function finishUnlock(sig?: string) {
    if (!meta) return;
    setGateError('');
    setUnlocking(true);
    const email = gateEmail.trim().toLowerCase();
    const name = gateName.trim();
    try {
      const unlocked = await unlock({
        email: email || undefined,
        name: name || undefined,
        passcode: meta.hasPasscode ? gatePasscode : undefined,
        signatureName: meta.ndaText ? sig : undefined,
        code: meta.verifyEmail ? gateCode.trim() || undefined : undefined,
      });
      setDoc(unlocked);
      try {
        sessionStorage.setItem(gateStorageKey(token!), JSON.stringify({
          email, name, signatureName: meta.ndaText ? sig : undefined,
        }));
      } catch { /* ignore */ }
    } catch (err) {
      const e = err as Error & { status?: number; verificationRequired?: boolean };
      if (e.status === 410) {
        setError(e.message);
      } else if (e.verificationRequired) {
        setGateError(e.message);
        setGateStep('verify');
      } else {
        setGateError(e.message);
        if (meta.ndaText) setGateStep('nda');
      }
    } finally {
      setUnlocking(false);
    }
  }

  function handleIdentifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta) return;
    const email = gateEmail.trim().toLowerCase();
    const needsEmail = meta.requireEmail || meta.hasAllowlist || meta.verifyEmail;
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGateError('Enter a valid email address');
      return;
    }
    if (meta.hasPasscode && !gatePasscode.trim()) {
      setGateError('Enter the passcode');
      return;
    }
    setGateError('');
    if (meta.verifyEmail) {
      sendVerifyCode(email).then(sent => { if (sent) setGateStep('verify'); });
      return;
    }
    if (meta.ndaText) {
      setGateStep('nda');
      return;
    }
    finishUnlock();
  }

  function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta) return;
    if (!/^\d{6}$/.test(gateCode.trim())) {
      setGateError('Enter the 6-digit code from your email');
      return;
    }
    setGateError('');
    if (meta.ndaText) {
      setGateStep('nda');
      return;
    }
    finishUnlock();
  }

  function handleNdaSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sig = signatureName.trim();
    if (!sig) {
      setGateError('Type your full legal name to sign');
      return;
    }
    if (!ndaAccepted) {
      setGateError('You must accept the agreement to continue');
      return;
    }
    finishUnlock(sig);
  }

  function handleDownload() {
    if (!doc || !meta) return;
    const sessionKey = getSessionKey();
    if (sessionKey) {
      fetch('/api/vault/tracking/download-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      }).catch(() => {});
    }
    const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.title.replace(/[^\w\- ]+/g, '').trim() || 'document'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSendNote() {
    const content = noteText.trim();
    const sessionKey = getSessionKey();
    if (!content || !sessionKey) return;
    setNoteSending(true);
    try {
      const res = await fetch('/api/vault/tracking/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, content }),
      });
      if (res.ok) {
        setSentNotes(prev => [...prev, content]);
        setNoteText('');
      }
    } catch { /* ignore */ }
    setNoteSending(false);
  }

  if (loading) {
    return <div className="sv-shell"><div className="sv-status">Loading...</div></div>;
  }

  if (error || !meta) {
    return (
      <div className="sv-shell">
        <div className="sv-status">
          <h2>Document unavailable</h2>
          <p>{error || 'This link is no longer active.'}</p>
        </div>
      </div>
    );
  }

  if (!doc && gateStep === 'verify' && meta.verifyEmail) {
    return (
      <div className="sv-shell">
        <form className="sv-gate" onSubmit={handleVerifySubmit}>
          <span className="sv-gate-kicker">Email Verification</span>
          <h1>{meta.title}</h1>
          <p>We sent a 6-digit code to {gateEmail.trim().toLowerCase()}. Enter it below to continue.</p>
          <input
            className="sv-gate-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={gateCode}
            onChange={e => setGateCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          {gateError && <p className="sv-gate-error">{gateError}</p>}
          <button className="sv-gate-btn" type="submit" disabled={unlocking || codeSending}>
            {unlocking ? 'Opening...' : meta.ndaText ? 'Continue' : 'Verify & View Document'}
          </button>
          <button
            className="sv-gate-back"
            type="button"
            disabled={codeSending}
            onClick={() => sendVerifyCode(gateEmail.trim().toLowerCase())}
          >
            {codeSending ? 'Sending...' : 'Resend code'}
          </button>
          <button className="sv-gate-back" type="button" onClick={() => { setGateStep('identify'); setGateError(''); }}>
            Back
          </button>
        </form>
      </div>
    );
  }

  if (!doc && gateStep === 'nda' && meta.ndaText) {
    return (
      <div className="sv-shell">
        <form className="sv-gate sv-gate--nda" onSubmit={handleNdaSubmit}>
          <span className="sv-gate-kicker">Confidentiality Agreement</span>
          <h1>{meta.title}</h1>
          <p>Before viewing, {meta.ownerEmail} requires you to accept this agreement.</p>
          <div className="sv-nda-text">{meta.ndaText}</div>
          <input
            className="sv-gate-input"
            type="text"
            placeholder="Type your full legal name to sign"
            value={signatureName}
            onChange={e => setSignatureName(e.target.value)}
            autoFocus
          />
          <label className="sv-nda-accept">
            <input type="checkbox" checked={ndaAccepted} onChange={e => setNdaAccepted(e.target.checked)} />
            I have read and agree to the terms above. My typed name, email, and the time of signing will be recorded.
          </label>
          {gateError && <p className="sv-gate-error">{gateError}</p>}
          <button className="sv-gate-btn" type="submit" disabled={unlocking}>
            {unlocking ? 'Signing...' : 'Sign & View Document'}
          </button>
          <button className="sv-gate-back" type="button" onClick={() => { setGateStep('identify'); setGateError(''); }}>
            Back
          </button>
        </form>
      </div>
    );
  }

  if (!doc) {
    const needsEmail = meta.requireEmail || meta.hasAllowlist || meta.verifyEmail;
    return (
      <div className="sv-shell">
        <form className="sv-gate" onSubmit={handleIdentifySubmit}>
          <span className="sv-gate-kicker">Shared via HSI Creative OS</span>
          <h1>{meta.title}</h1>
          <p>
            {meta.ownerEmail} shared this document with you.
            {needsEmail ? ' Enter your email to view it.' : ''}
            {meta.hasPasscode ? ' A passcode is required.' : ''}
          </p>
          {needsEmail && (
            <>
              <input
                className="sv-gate-input"
                type="email"
                placeholder="Your email"
                value={gateEmail}
                onChange={e => setGateEmail(e.target.value)}
                autoFocus
              />
              <input
                className="sv-gate-input"
                type="text"
                placeholder="Your name (optional)"
                value={gateName}
                onChange={e => setGateName(e.target.value)}
              />
            </>
          )}
          {meta.hasPasscode && (
            <input
              className="sv-gate-input"
              type="password"
              placeholder="Passcode"
              value={gatePasscode}
              onChange={e => setGatePasscode(e.target.value)}
              autoFocus={!needsEmail}
            />
          )}
          {gateError && <p className="sv-gate-error">{gateError}</p>}
          <button className="sv-gate-btn" type="submit" disabled={unlocking}>
            {unlocking ? 'Opening...' : meta.ndaText ? 'Continue' : 'View Document'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className="sv-shell sv-shell--doc"
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
    >
      <header className="sv-header">
        <div className="sv-header-title">
          <span className="sv-header-kicker">HSI Creative OS</span>
          <h1>{meta.title}</h1>
        </div>
        <div className="sv-header-side">
          <span className="sv-header-meta">Shared by {meta.ownerEmail} · {pages.length} page{pages.length === 1 ? '' : 's'}</span>
          {doc.allowDownload && (
            <button className="sv-download-btn" onClick={handleDownload}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download
            </button>
          )}
        </div>
      </header>

      <main className="sv-pages">
        {pages.map((page, i) => (
          <div
            key={i}
            className="sv-page"
            data-page={i}
            ref={el => { pagesRef.current[i] = el; }}
          >
            <pre className="sv-page-text">{page}</pre>
            {doc.watermarkText && (
              <div className="sv-watermark" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, w) => (
                  <span key={w}>{doc.watermarkText}</span>
                ))}
              </div>
            )}
            <span className="sv-page-num">{i + 1} / {pages.length}</span>
          </div>
        ))}
      </main>

      <div className={`sv-notes ${notesOpen ? 'sv-notes--open' : ''}`}>
        {notesOpen && (
          <div className="sv-notes-panel">
            <div className="sv-notes-head">
              <strong>Leave a note</strong>
              <button className="sv-notes-close" onClick={() => setNotesOpen(false)}>&times;</button>
            </div>
            {sentNotes.length > 0 && (
              <div className="sv-notes-sent">
                {sentNotes.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
            <textarea
              className="sv-notes-input"
              placeholder="Share feedback with the author..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <button className="sv-notes-send" onClick={handleSendNote} disabled={noteSending || !noteText.trim()}>
              {noteSending ? 'Sending...' : 'Send to author'}
            </button>
          </div>
        )}
        {!notesOpen && (
          <button className="sv-notes-fab" onClick={() => setNotesOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Leave a note
          </button>
        )}
      </div>
    </div>
  );
}
