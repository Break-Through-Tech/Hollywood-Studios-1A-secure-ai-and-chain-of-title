import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { SettingsPage } from './SettingsPage';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [displayKey, setDisplayKey] = useState(location.pathname);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const animating = location.pathname !== displayKey;

  useEffect(() => {
    if (location.pathname !== displayKey) {
      const t = setTimeout(() => setDisplayKey(location.pathname), 180);
      return () => clearTimeout(t);
    }
  }, [location.pathname, displayKey]);

  return (
    <div className="net-page">
      <AppSidebar onSettingsClick={() => setSettingsOpen(true)} />
      <main className={`net-main app-transition ${animating ? 'app-transition--out' : 'app-transition--in'}`}>
        {children}
      </main>
      {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
