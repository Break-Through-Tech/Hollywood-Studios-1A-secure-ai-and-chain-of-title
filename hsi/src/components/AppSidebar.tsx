import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar } from './Avatar';

type Icon = string | string[];
interface NavItem { path: string; label: string; icon: Icon; mobile?: boolean; soon?: boolean }

const NAV: NavItem[] = [
  { path: '/network', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', mobile: true },
  { path: '/search', label: 'Search', icon: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'm20 20-3.5-3.5'], mobile: true },
  { path: '/projects', label: 'Projects', icon: 'M4 6h16M4 12h16M4 18h10' },
  { path: '/vault', label: 'Creative OS', icon: ['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 9h18M8 4v5'], mobile: true },
  { path: '/people', label: 'People', icon: ['M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.5a3.5 3.5 0 0 1 0 7', 'M21.5 20a6.5 6.5 0 0 0-4-6'], mobile: true },
  { path: '/messages', label: 'Messages', icon: 'M21 14a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', mobile: true },
  { path: '/analytics', label: 'Analytics', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', soon: true },
];

const ICON_SETTINGS = ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'];

function NavIcon({ icon }: { icon: Icon }) {
  const paths = Array.isArray(icon) ? icon : [icon];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

interface Me { handle: string | null; display_name: string | null; avatar_url: string | null }

// The rail remounts on every route; the signed-in person doesn't change between them.
let meCache: Promise<Me | null> | null = null;
function loadMe(): Promise<Me | null> {
  if (meCache) return meCache;
  const email = localStorage.getItem('hsi-user-email');
  if (!email) return Promise.resolve(null);
  meCache = fetch('/api/settings/account/get', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  })
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d?.profile ? { handle: d.profile.handle, display_name: d.profile.display_name, avatar_url: d.profile.avatar_url } : { handle: null, display_name: email, avatar_url: null }))
    .catch(() => null);
  return meCache;
}

export function AppSidebar({ onSettingsClick }: { onSettingsClick?: () => void }) {
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { let on = true; loadMe().then(m => { if (on) setMe(m); }); return () => { on = false; }; }, []);

  const isActive = (path: string) => location.pathname === path || (path !== '/network' && location.pathname.startsWith(path + '/'));
  const onProfile = me?.handle ? location.pathname === `/profile/${me.handle}` : false;

  return (
    <>
      <aside className="rail" aria-label="Primary">
        <Link to="/" className="rail-logo" title="Hollywood Studios">
          <img src="/logo.png" alt="" />
          <span>Hollywood Studios</span>
        </Link>
        <nav className="rail-nav">
          {NAV.map(item => (
            <Link key={item.path} to={item.path} className={`rail-item ${isActive(item.path) ? 'on' : ''}`} title={item.label}>
              <NavIcon icon={item.icon} />
              <span className="rail-label">{item.label}</span>
              {item.soon && <span className="rail-tag">Soon</span>}
            </Link>
          ))}
          <div className="rail-group">You</div>
          {me?.handle && (
            <Link to={`/profile/${me.handle}`} className={`rail-item ${onProfile ? 'on' : ''}`} title="Profile">
              <NavIcon icon={['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M4 21a8 8 0 0 1 16 0']} />
              <span className="rail-label">Profile</span>
            </Link>
          )}
          <button type="button" className="rail-item" onClick={onSettingsClick} title="Settings">
            <NavIcon icon={ICON_SETTINGS} />
            <span className="rail-label">Settings</span>
          </button>
        </nav>
        <div className="rail-me">
          {me ? (
            <>
              <Avatar name={me.display_name || 'Member'} src={me.avatar_url} size={32} />
              <span className="rail-me-text">
                <b>{me.display_name || 'Member'}</b>
                {me.handle && <small>@{me.handle}</small>}
              </span>
            </>
          ) : (
            <Link to="/login" className="btn btn-secondary btn-sm btn-block">Sign in</Link>
          )}
        </div>
      </aside>

      <nav className="tabbar" aria-label="Primary">
        {NAV.filter(i => i.mobile).map(item => (
          <Link key={item.path} to={item.path} className={`tabbar-item ${isActive(item.path) ? 'on' : ''}`}>
            <NavIcon icon={item.icon} />
            <span>{item.label === 'Creative OS' ? 'Creative' : item.label}</span>
          </Link>
        ))}
        <button type="button" className="tabbar-item" onClick={onSettingsClick}>
          {me ? <Avatar name={me.display_name || 'Member'} src={me.avatar_url} size={22} /> : <NavIcon icon={ICON_SETTINGS} />}
          <span>You</span>
        </button>
      </nav>
    </>
  );
}
