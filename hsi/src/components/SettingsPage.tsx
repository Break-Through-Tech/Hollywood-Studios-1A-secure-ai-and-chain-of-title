import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsAccount } from './settings/SettingsAccount';
import { SettingsPages } from './settings/SettingsPages';
import { SettingsAccessCodes } from './settings/SettingsAccessCodes';
import { SettingsFriends } from './settings/SettingsFriends';
import { SettingsNetwork } from './settings/SettingsNetwork';
import { SettingsUpgrade } from './settings/SettingsUpgrade';
import { SettingsCreatePage } from './settings/SettingsCreatePage';

type Tab = 'account' | 'pages' | 'codes' | 'friends' | 'network' | 'create' | 'upgrade';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'account', label: 'Your Account', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { key: 'pages', label: 'Your Pages', icon: 'M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1' },
  { key: 'codes', label: 'Access Codes', icon: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3' },
  { key: 'friends', label: 'Connections', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { key: 'network', label: 'Network', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
  { key: 'create', label: 'Create Page', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6' },
  { key: 'upgrade', label: 'Upgrade Account', icon: 'M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z' },
];

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const navigate = useNavigate();
  const email = localStorage.getItem('hsi-user-email') || '';

  function handleSignOut() {
    localStorage.removeItem('hsi-user-email');
    localStorage.removeItem('hsi-session-token');
    onClose();
    navigate('/login');
  }

  if (activeTab === 'upgrade') {
    return (
      <div className="set-overlay" onClick={onClose}>
        <div className="set-upgrade-container" onClick={(e) => e.stopPropagation()}>
          <SettingsUpgrade onClose={() => setActiveTab('account')} />
        </div>
      </div>
    );
  }

  return (
    <div className="set-overlay" onClick={onClose}>
      <div className="set-container" onClick={(e) => e.stopPropagation()}>
        <aside className="set-sidebar">
          <div className="set-sidebar-center">
            <h3 className="set-sidebar-title">SETTINGS</h3>
            <nav className="set-sidebar-nav">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`set-sidebar-item ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          <button className="set-signout" onClick={handleSignOut}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </aside>

        <div className="set-content">
          <button className="set-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          {activeTab === 'account' && <SettingsAccount email={email} />}
          {activeTab === 'pages' && <SettingsPages email={email} />}
          {activeTab === 'codes' && <SettingsAccessCodes email={email} />}
          {activeTab === 'friends' && <SettingsFriends email={email} />}
          {activeTab === 'network' && <SettingsNetwork email={email} />}
          {activeTab === 'create' && <SettingsCreatePage email={email} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
