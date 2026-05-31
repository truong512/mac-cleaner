import { Navigate, NavLink, useLocation } from 'react-router-dom';
import { ScanCacheProvider } from '../context/ScanCacheContext';
import { KeepAlivePage } from './KeepAlivePage';
import { ProgressOverlay } from './ProgressOverlay';
import { useOperationProgress } from '../hooks/useScanProgress';
import { Dashboard } from '../pages/Dashboard';
import { JunkScan } from '../pages/JunkScan';
import { Applications } from '../pages/Applications';
import { Duplicates } from '../pages/Duplicates';
import { DiskMap } from '../pages/DiskMap';
import { BigFiles } from '../pages/BigFiles';
import { SettingsPage } from '../pages/Settings';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/junk', label: 'Smart Scan', icon: '✦' },
  { to: '/apps', label: 'Applications', icon: '▣' },
  { to: '/duplicates', label: 'Duplicates', icon: '⧉' },
  { to: '/bigfiles', label: 'Big Files', icon: '▤' },
  { to: '/disk', label: 'Space Map', icon: '◫' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

const KNOWN_PATHS = new Set(navItems.map((item) => item.to));

export function Layout() {
  const { progress, active, kind } = useOperationProgress();
  const path = useLocation().pathname;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">⌘</span>
          <div>
            <strong>Mac Cleaner</strong>
            <small>System maintenance</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <ScanCacheProvider>
          <ProgressOverlay progress={progress} visible={active && kind === 'scan'} kind={kind} />
          <KeepAlivePage active={path === '/junk'}>
            <JunkScan />
          </KeepAlivePage>
          <KeepAlivePage active={path === '/apps'}>
            <Applications />
          </KeepAlivePage>
          <KeepAlivePage active={path === '/duplicates'}>
            <Duplicates />
          </KeepAlivePage>
          <KeepAlivePage active={path === '/bigfiles'}>
            <BigFiles />
          </KeepAlivePage>
          <KeepAlivePage active={path === '/disk'}>
            <DiskMap />
          </KeepAlivePage>
          {path === '/' && <Dashboard />}
          {path === '/settings' && <SettingsPage />}
          {!KNOWN_PATHS.has(path) && <Navigate to="/" replace />}
        </ScanCacheProvider>
      </main>
    </div>
  );
}
