import { useState, useEffect } from 'react';

export function SettingsNetwork({ email }: { email: string }) {
  const [milestonesEnabled, setMilestonesEnabled] = useState(true);

  useEffect(() => {
    fetch('/api/settings/network/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((d) => setMilestonesEnabled(d.milestones_enabled !== false));
  }, [email]);

  async function toggle() {
    const updated = !milestonesEnabled;
    setMilestonesEnabled(updated);
    await fetch('/api/settings/network/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, milestonesEnabled: updated }),
    });
  }

  return (
    <div className="set-network">
      <h2 className="set-heading">Network</h2>

      <div className="set-milestone-card">
        <div className="set-milestone-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <div className="set-milestone-info">
          <span className="set-milestone-title">Milestones</span>
          <span className="set-milestone-desc">(Most Viewed Video, Friends, etc)</span>
        </div>
        <button className={`set-toggle-btn ${milestonesEnabled ? 'active' : ''}`} onClick={toggle}>
          {milestonesEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
    </div>
  );
}
