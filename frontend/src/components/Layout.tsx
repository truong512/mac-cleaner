import { Navigate, useLocation } from 'react-router-dom';
import appIcon from '@app-icon';
import { ScanCacheProvider } from '../context/ScanCacheContext';
import { KeepAlivePage } from './KeepAlivePage';
import { ProgressOverlay } from './ProgressOverlay';
import { SidebarNav } from './SidebarNav';
import { useOperationProgress } from '../hooks/useScanProgress';
import { Dashboard } from '../pages/Dashboard';
import { JunkScan } from '../pages/JunkScan';
import { Applications } from '../pages/Applications';
import { Duplicates } from '../pages/Duplicates';
import { DiskMap } from '../pages/DiskMap';
import { BigFiles } from '../pages/BigFiles';
import { SettingsPage } from '../pages/Settings';
import { Snapshots } from '../pages/Snapshots';
import { DockerPage } from '../pages/Docker';

const KNOWN_PATHS = new Set([
  '/',
  '/junk',
  '/apps',
  '/duplicates',
  '/bigfiles',
  '/disk',
  '/docker',
  '/settings',
  '/snapshots',
]);

export function Layout() {
  return (
    <ScanCacheProvider>
      <LayoutShell />
    </ScanCacheProvider>
  );
}

function LayoutShell() {
  const { progress, active, kind } = useOperationProgress();
  const path = useLocation().pathname;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={appIcon} alt="" className="brand-icon" width={36} height={36} />
          <div>
            <strong>Mac Cleaner</strong>
            <small>System maintenance</small>
          </div>
        </div>
        <SidebarNav />
      </aside>
      <main className="content">
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
        {path === '/snapshots' && <Snapshots />}
        {path === '/docker' && <DockerPage />}
        {!KNOWN_PATHS.has(path) && <Navigate to="/" replace />}
      </main>
    </div>
  );
}
