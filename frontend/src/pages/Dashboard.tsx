import { useEffect, useState } from 'react';
import {
  GetDiskSummary,
  GetPermissionStatus,
  OpenFullDiskAccessSettings,
} from '../../wailsjs/go/main/App';
import type { DiskSummary, PermissionStatus } from '../types';
import { formatBytes, formatPercent } from '../utils/format';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const [disk, setDisk] = useState<DiskSummary | null>(null);
  const [perm, setPerm] = useState<PermissionStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [d, p] = await Promise.all([GetDiskSummary(), GetPermissionStatus()]);
      setDisk(d);
      setPerm(p);
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard');
    }
  }

  const usedPct = disk ? formatPercent(disk.usedBytes, disk.totalBytes) : 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of disk space and system access</p>
        </div>
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

      <div className="page-body page-body-scroll">
      <div className="grid-3">
        <div className="card stat-card">
          <span className="stat-label">Disk Used</span>
          <strong className="stat-value">{usedPct}%</strong>
          {disk && (
            <p>{formatBytes(disk.usedBytes)} of {formatBytes(disk.totalBytes)}</p>
          )}
          <div className="meter">
            <div className="meter-fill" style={{ width: `${usedPct}%` }} />
          </div>
        </div>

        <div className="card stat-card">
          <span className="stat-label">Free Space</span>
          <strong className="stat-value">{disk ? formatBytes(disk.freeBytes) : '—'}</strong>
          <p>{disk?.mountPoint || 'Home volume'}</p>
        </div>

        <div className="card stat-card">
          <span className="stat-label">Full Disk Access</span>
          <strong className={`stat-value status-${perm?.fullDiskAccess || 'unknown'}`}>
            {perm?.fullDiskAccess || 'checking...'}
          </strong>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid-2">
        <Link to="/junk" className="card action-card">
          <h3>Smart Scan</h3>
          <p>Find caches, logs, and safe-to-remove junk files</p>
        </Link>
        <Link to="/apps" className="card action-card">
          <h3>Applications</h3>
          <p>Uninstall apps and remove leftover support files</p>
        </Link>
        <Link to="/duplicates" className="card action-card">
          <h3>Duplicates</h3>
          <p>Find duplicate files and reclaim storage</p>
        </Link>
        <Link to="/bigfiles" className="card action-card">
          <h3>Big Files & Archives</h3>
          <p>Find large files and old downloads to remove</p>
        </Link>
        <Link to="/disk" className="card action-card">
          <h3>Space Map</h3>
          <p>Visualize what's using your disk space</p>
        </Link>
      </div>
      </div>
    </div>
  );
}
