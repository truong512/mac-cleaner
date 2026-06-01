import { useEffect, useState } from 'react';
import {
  GetDiskSummary,
  GetPermissionStatus,
  GetStorageInsights,
  ListLocalSnapshots,
  OpenFullDiskAccessSettings,
} from '../../wailsjs/go/main/App';
import type { DiskSummary, PermissionStatus, StorageInsight } from '../types';
import { formatBytes, formatPercent } from '../utils/format';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const [disk, setDisk] = useState<DiskSummary | null>(null);
  const [perm, setPerm] = useState<PermissionStatus | null>(null);
  const [insights, setInsights] = useState<StorageInsight[]>([]);
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [d, p, ins, snaps] = await Promise.all([
        GetDiskSummary(),
        GetPermissionStatus(),
        GetStorageInsights(),
        ListLocalSnapshots('/').catch(() => []),
      ]);
      setDisk(d);
      setPerm(p);
      setInsights(ins || []);
      setSnapshotCount(snaps?.length ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    }
  }

  const usedPct = disk ? formatPercent(disk.usedBytes, disk.totalBytes) : 0;
  const meterTone =
    usedPct >= 90 ? 'critical' : usedPct >= 75 ? 'warning' : usedPct >= 50 ? 'moderate' : 'healthy';

  const actions = [
    { to: '/junk', title: 'Smart Scan', desc: 'Find caches, logs, and safe-to-remove junk files', icon: '✨', tone: 'violet' },
    { to: '/apps', title: 'Applications', desc: 'Uninstall apps and remove leftover support files', icon: '📦', tone: 'rose' },
    { to: '/duplicates', title: 'Duplicates', desc: 'Find duplicate files and reclaim storage', icon: '⧉', tone: 'cyan' },
    { to: '/bigfiles', title: 'Big Files & Archives', desc: 'Find large files and old downloads to remove', icon: '📁', tone: 'amber' },
    { to: '/disk', title: 'Space Map', desc: "Visualize what's using your disk space", icon: '🗺', tone: 'emerald' },
    { to: '/docker', title: 'Docker', desc: 'Inspect images, volumes, and build cache usage', icon: '🐳', tone: 'sky' },
  ] as const;

  const insightTones = ['fuchsia', 'orange', 'teal', 'lime', 'pink', 'indigo'] as const;

  return (
    <div className="page page--dashboard">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of disk space and system access</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {perm?.fullDiskAccess === 'denied' && (
        <div className="alert alert-warning">
          Full Disk Access is not granted. Some scans may be incomplete.{' '}
          <button className="link-btn" onClick={() => OpenFullDiskAccessSettings()}>
            Open System Settings
          </button>
        </div>
      )}

      <div className="page-body page-body-scroll dashboard-stack">
        <div className="grid-3">
          <div className="card stat-card stat-card--disk">
            <div className="stat-card-head">
              <span className="stat-icon" aria-hidden>💾</span>
              <span className="stat-label">Disk Used</span>
            </div>
            <strong className="stat-value">{usedPct}%</strong>
            {disk && (
              <p>
                {formatBytes(disk.usedBytes)} of {formatBytes(disk.totalBytes)}
              </p>
            )}
            <div className="meter">
              <div className={`meter-fill meter-fill--${meterTone}`} style={{ width: `${usedPct}%` }} />
            </div>
          </div>

          <div className="card stat-card stat-card--free">
            <div className="stat-card-head">
              <span className="stat-icon" aria-hidden>🌿</span>
              <span className="stat-label">Free Space</span>
            </div>
            <strong className="stat-value">{disk ? formatBytes(disk.freeBytes) : '—'}</strong>
            <p>{disk?.mountPoint || 'Home volume'}</p>
          </div>

          <div className={`card stat-card stat-card--perm stat-card--perm-${perm?.fullDiskAccess || 'unknown'}`}>
            <div className="stat-card-head">
              <span className="stat-icon" aria-hidden>🔐</span>
              <span className="stat-label">Full Disk Access</span>
            </div>
            <strong className={`stat-value status-${perm?.fullDiskAccess || 'unknown'}`}>
              {perm?.fullDiskAccess || 'checking...'}
            </strong>
          </div>
        </div>

        {snapshotCount !== null && snapshotCount > 0 && (
          <div className="card insight-card insight-card--snapshot">
            <h3>Time Machine Local Snapshots</h3>
            <p>
              <strong>{snapshotCount}</strong> local snapshot(s) on your startup disk. These can use
              significant space under System Data.
            </p>
            <Link to="/snapshots" className="btn btn-secondary btn-sm">
              Manage snapshots
            </Link>
          </div>
        )}

        {insights.length > 0 && (
          <div className="grid-3">
            {insights.map((ins, i) => (
              <div
                key={ins.id}
                className={`card insight-card insight-card--${insightTones[i % insightTones.length]}`}
              >
                <span className="stat-label">{ins.label}</span>
                <strong className="stat-value">
                  {ins.available ? formatBytes(ins.sizeBytes) : '—'}
                </strong>
                {ins.description && <p className="muted">{ins.description}</p>}
                {ins.preset ? (
                  <Link to={`/junk?preset=${ins.preset}`} className="btn btn-secondary btn-sm">
                    {ins.preset === 'photos'
                      ? 'Open Photos caches in Smart Scan'
                      : ins.preset === 'mail'
                        ? 'Open Mail caches in Smart Scan'
                        : ins.preset === 'developer'
                          ? 'Open Developer caches in Smart Scan'
                          : 'Open in Smart Scan'}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="grid-2 dashboard-actions">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={`card action-card action-card--${action.tone}`}
            >
              <span className="action-card-icon" aria-hidden>
                {action.icon}
              </span>
              <div>
                <h3>{action.title}</h3>
                <p>{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
