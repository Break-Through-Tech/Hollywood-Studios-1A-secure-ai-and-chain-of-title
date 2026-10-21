import { useState, useEffect } from 'react';
import { blobUrl } from '../../blobUrl';

interface Friend {
  id: number;
  friend_email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface FriendRequest {
  id: number;
  from_email: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  created_at: string;
}

export function SettingsFriends({ email }: { email: string }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings/friends/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json())
      .then((d) => {
        setFriends(d.friends || []);
        setRequests(d.requests || []);
      });
  }, [email]);

  async function respondToRequest(id: number, action: 'accept' | 'decline') {
    await fetch('/api/settings/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, friendshipId: id, action }),
    });
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (action === 'accept') {
      const req = requests.find((r) => r.id === id);
      if (req) {
        setFriends((prev) => [...prev, {
          id: req.id,
          friend_email: req.from_email,
          display_name: req.display_name,
          handle: req.handle,
          avatar_url: req.avatar_url,
          created_at: req.created_at,
        }]);
      }
    }
  }

  async function removeFriend(id: number) {
    await fetch('/api/settings/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, friendshipId: id }),
    });
    setFriends((prev) => prev.filter((f) => f.id !== id));
    setMenuOpen(null);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="set-friends">
      <h2 className="set-heading">Connections <span className="set-count">({friends.length})</span></h2>

      <div className="set-requests-bar">
        <span className="set-requests-label">Requests</span>
        <span className="set-requests-count">{requests.length > 0 ? requests.length : 'NONE'}</span>
        {requests.length > 0 && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        )}
      </div>

      {requests.length > 0 && (
        <div className="set-requests-list">
          {requests.map((req) => (
            <div key={req.id} className="set-request-row">
              <div className="set-friend-avatar">
                {req.avatar_url ? (
                  <img src={blobUrl(req.avatar_url) || req.avatar_url} alt="" />
                ) : (
                  <span>{(req.display_name || req.from_email).charAt(0).toUpperCase()}</span>
                )}
              </div>
              <span className="set-friend-name">{req.display_name || req.from_email}</span>
              <div className="set-request-actions">
                <button className="btn btn-primary btn-sm" onClick={() => respondToRequest(req.id, 'accept')}>Accept</button>
                <button className="btn btn-secondary btn-sm" onClick={() => respondToRequest(req.id, 'decline')}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friends.length > 0 && (
        <div className="set-table">
          <div className="set-table-header">
            <span className="set-table-col set-table-col--friend">Connection</span>
            <span className="set-table-col set-table-col--since">Connected since</span>
            <span className="set-table-col set-table-col--actions" />
          </div>
          {friends.map((f) => (
            <div key={f.id} className="set-table-row">
              <div className="set-table-col set-table-col--friend">
                <div className="set-friend-avatar">
                  {f.avatar_url ? (
                    <img src={blobUrl(f.avatar_url) || f.avatar_url} alt="" />
                  ) : (
                    <span>{(f.display_name || f.friend_email).charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="set-friend-name">{f.display_name || f.friend_email}</span>
              </div>
              <div className="set-table-col set-table-col--since">
                {formatDate(f.created_at)}
              </div>
              <div className="set-table-col set-table-col--actions">
                <div className="set-menu-wrap">
                  <button className="set-page-menu" onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </button>
                  {menuOpen === f.id && (
                    <div className="set-dropdown">
                      <button className="set-dropdown-item" onClick={() => removeFriend(f.id)}>Remove Connection</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
