import { useState, useEffect } from 'react';

export function SettingsAccessCodes({ email }: { email: string }) {
  const [members, setMembers] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [codeCount, setCodeCount] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch('/api/settings/codes/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members || 0);
        setFollowers(d.followers || 0);
        setCodeCount(d.codes?.length || 0);
      });
  }, [email]);

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setSending(true);
    await fetch('/api/settings/codes/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, invitedEmail: inviteEmail.trim() }),
    });
    setSending(false);
    setSent(true);
    setCodeCount((c) => c + 1);
    setTimeout(() => {
      setSent(false);
      setShowInvite(false);
      setInviteEmail('');
    }, 2000);
  }

  return (
    <div className="set-codes">
      <h2 className="set-heading">Access Codes <span className="set-count">({codeCount})</span></h2>

      <div className="set-promo-card">
        <div className="set-promo-content">
          <h3 className="set-promo-title">Get 7 days free</h3>
          <p className="set-promo-desc">Invite a new creator to Palo and you both get 7 days for free.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowInvite(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Invite a Friend
        </button>
      </div>

      <h3 className="set-subheading set-mt">Members invited by you</h3>

      <div className="set-stats-row">
        <div className="set-stat-block">
          <span className="set-stat-number">{members}</span>
          <span className="set-stat-label">Members</span>
        </div>
        <div className="set-stat-block">
          <span className="set-stat-number">{followers}</span>
          <span className="set-stat-label">Followers</span>
        </div>
        <div className="set-stat-circles">
          <div className="set-circle set-circle--1" />
          <div className="set-circle set-circle--2" />
          <div className="set-circle set-circle--3" />
        </div>
      </div>

      {showInvite && (
        <div className="set-modal-backdrop" onClick={() => setShowInvite(false)}>
          <div className="set-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="set-modal-title">Invite a Friend</h3>
            <label className="set-label">Friend's Email</label>
            <input type="email" className="set-input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="friend@example.com" autoFocus />
            {sent && <p className="set-success">Invite sent!</p>}
            <div className="set-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={sendInvite} disabled={sending}>{sending ? 'Sending...' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
