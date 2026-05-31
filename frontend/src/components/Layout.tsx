import { NavLink, Outlet } from 'react-router-dom';
import { ProgressOverlay } from './ProgressOverlay';
import { useOperationProgress } from '../hooks/useScanProgress';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/junk', label: 'Smart Scan', icon: '✦' },
  { to: '/apps', label: 'Applications', icon: '▣' },
  { to: '/duplicates', label: 'Duplicates', icon: '⧉' },
  { to: '/bigfiles', label: 'Big Files', icon: '▤' },
  { to: '/disk', label: 'Space Map', icon: '◫' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function Layout() {
  const { progress, active, kind } = useOperationProgress();

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
        <ProgressOverlay progress={progress} visible={active && kind === 'scan'} kind={kind} />
        <Outlet />
      </main>
    </div>
  );
}
