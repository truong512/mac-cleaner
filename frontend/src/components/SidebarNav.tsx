import { NavLink } from 'react-router-dom';
import { useNavScanBadges } from '../hooks/useNavScanBadges';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/junk', label: 'Smart Scan', icon: '✦' },
  { to: '/apps', label: 'Applications', icon: '▣' },
  { to: '/duplicates', label: 'Duplicates', icon: '⧉' },
  { to: '/bigfiles', label: 'Big Files', icon: '▤' },
  { to: '/disk', label: 'Space Map', icon: '◫' },
  { to: '/docker', label: 'Docker', icon: '⬡' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function SidebarNav() {
  const badges = useNavScanBadges();

  return (
    <nav>
      {navItems.map((item) => {
        const badge = badges[item.to];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <span className="nav-link-main">
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </span>
            {badge ? (
              <span className="nav-badge" title={`${item.label}: ${badge}`}>
                {badge}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
