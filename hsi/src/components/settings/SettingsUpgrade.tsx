import { useState, useEffect } from 'react';

interface SubStatus {
  tier: string | null;
  status: string | null;
  trialEnd: string | null;
}

export function SettingsUpgrade({ onClose }: { onClose: () => void }) {
  const email = localStorage.getItem('hsi-user-email') || '';
  const [sub, setSub] = useState<SubStatus>({ tier: null, status: null, trialEnd: null });
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/stripe/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSub(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const currentTier = isActive ? sub.tier : null;

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    setError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManage() {
    setPortalLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Portal failed');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPortalLoading(false);
    }
  }

  function tierLabel(tier: string | null) {
    if (tier === 'studio_max') return 'Studio Max';
    if (tier === 'studio') return 'Studio';
    return 'Free';
  }

  function statusLabel(status: string | null) {
    if (status === 'trialing') return 'Trial';
    if (status === 'active') return 'Active';
    if (status === 'past_due') return 'Past Due';
    if (status === 'canceled') return 'Canceled';
    return '';
  }

  return (
    <div className="set-upgrade">
      <button className="set-upgrade-close" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      <div className="set-upgrade-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-.89 0-1.74-.36-2.363-.993l-.548-.547z" />
        </svg>
      </div>

      {isActive && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: 'var(--gold-pale)', color: '#4f8fff', fontSize: 13, fontWeight: 600 }}>
            {tierLabel(sub.tier)} &middot; {statusLabel(sub.status)}
          </span>
          {sub.status === 'trialing' && sub.trialEnd && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              Trial ends {new Date(sub.trialEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      <h2 className="set-upgrade-title">{isActive ? 'Manage your plan.' : 'Unlock your Palo.'}</h2>

      {error && <p style={{ color: 'var(--bad)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</p>}

      {isActive && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <button
            className="set-plan-cta"
            onClick={handleManage}
            disabled={portalLoading}
            style={{ maxWidth: 260 }}
          >
            {portalLoading ? 'Loading...' : 'Manage Subscription'}
          </button>
        </div>
      )}

      <div className="set-plans-row">
        <div className={`set-plan-card ${currentTier === 'studio' ? 'set-plan-card--active' : ''}`}>
          <div className="set-plan-tier">Studio</div>
          <div className="set-plan-price">$75 <span className="set-plan-period">/month</span></div>
          {currentTier === 'studio' ? (
            <button className="set-plan-cta" disabled style={{ opacity: 0.6 }}>Current Plan</button>
          ) : (
            <button
              className="set-plan-cta"
              onClick={() => handleCheckout('studio')}
              disabled={loading || !!checkoutLoading}
            >
              {checkoutLoading === 'studio' ? 'Loading...' : 'Try 7 days free'}
            </button>
          )}
          <p className="set-plan-trial">Start with a <strong>7-day free trial</strong>, cancel anytime.</p>
          <ul className="set-plan-features">
            <li>
              <span className="set-plan-feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4" /></svg>
              </span>
              <div>
                <strong>Set Palo to Work</strong>
                <span>Palo will watch & analyze your content 24/7</span>
              </div>
            </li>
            <li>
              <span className="set-plan-feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              </span>
              <div>
                <strong>Palo Brain</strong>
                <span>Visualize your content and discover patterns.</span>
              </div>
            </li>
            <li>
              <span className="set-plan-feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </span>
              <div>
                <strong>Palo Chat</strong>
                <span>Ask for ideas, advice, insights & more.</span>
              </div>
            </li>
            <li>
              <span className="set-plan-feature-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              </span>
              <div>
                <strong>Palo Outline</strong>
                <span>Structure out your videos to perfect them.</span>
              </div>
            </li>
          </ul>
        </div>

        <div className={`set-plan-card set-plan-card--max ${currentTier === 'studio_max' ? 'set-plan-card--active' : ''}`}>
          <div className="set-plan-tier">Studio <span className="set-plan-max">Max</span></div>
          <div className="set-plan-price">$150 <span className="set-plan-period">/month</span></div>
          {currentTier === 'studio_max' ? (
            <button className="set-plan-cta set-plan-cta--max" disabled style={{ opacity: 0.6 }}>Current Plan</button>
          ) : (
            <button
              className="set-plan-cta set-plan-cta--max"
              onClick={() => handleCheckout('studio_max')}
              disabled={loading || !!checkoutLoading}
            >
              {checkoutLoading === 'studio_max' ? 'Loading...' : isActive ? 'Upgrade' : 'Try 7 days free'}
            </button>
          )}
          <p className="set-plan-trial">Start with a <strong>7-day free trial</strong>, cancel anytime.</p>
          <div className="set-plan-includes">Everything in Studio, plus:</div>
          <ul className="set-plan-features">
            <li>
              <span className="set-plan-feature-plus">+</span>
              <div>
                <strong>20x more usage</strong>
                <span>Get even more out of Palo.</span>
              </div>
            </li>
            <li>
              <span className="set-plan-feature-plus">+</span>
              <div>
                <strong>Up to 5 pages</strong>
                <span>Palo will watch up to 5 of your pages 24/7.</span>
              </div>
            </li>
            <li>
              <span className="set-plan-feature-plus">+</span>
              <div>
                <strong>Overnight Ideas</strong>
                <span>Palo will think of ideas while you sleep.</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
