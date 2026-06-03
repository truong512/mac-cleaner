import { useEffect, useState } from 'react';
import {
  DownloadCatalogFromGit,
  GetAuditLogPath,
  GetCatalogInfo,
  GetSettings,
  OpenFullDiskAccessSettings,
  RefreshPermissions,
  ResetCatalog,
  SaveSettings,
} from '../../wailsjs/go/main/App';
import type { AppSettings, PermissionStatus } from '../types';
import type { model } from '../types';

type CatalogInfo = model.CatalogInfo;

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    dryRunDefault: true,
    excludeGlobs: [],
    bigFilesMinBytes: 50 * 1024 * 1024,
  });
  const [perm, setPerm] = useState<PermissionStatus | null>(null);
  const [excludeText, setExcludeText] = useState('');
  const [auditPath, setAuditPath] = useState('');
  const [saved, setSaved] = useState(false);
  const [catalogInfo, setCatalogInfo] = useState<CatalogInfo | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);

  async function refreshCatalogInfo() {
    const info = await GetCatalogInfo();
    setCatalogInfo(info);
  }

  useEffect(() => {
    GetSettings().then((s) => {
      setSettings(s);
      setExcludeText((s.excludeGlobs || []).join('\n'));
    });
    RefreshPermissions().then(setPerm);
    GetAuditLogPath().then(setAuditPath);
    void refreshCatalogInfo();
  }, []);

  async function downloadCatalog() {
    setCatalogBusy(true);
    setCatalogMsg(null);
    setCatalogErr(null);
    try {
      await DownloadCatalogFromGit('');
      await refreshCatalogInfo();
      setCatalogMsg('Catalog downloaded from GitHub. Run Smart Scan again to use the new rules.');
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogBusy(false);
    }
  }

  async function resetCatalog() {
    setCatalogBusy(true);
    setCatalogMsg(null);
    setCatalogErr(null);
    try {
      await ResetCatalog();
      await refreshCatalogInfo();
      setCatalogMsg('Restored built-in catalog.');
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogBusy(false);
    }
  }

  async function save() {
    const next: AppSettings = {
      ...settings,
      excludeGlobs: excludeText.split('\n').map((l) => l.trim()).filter(Boolean),
    };
    await SaveSettings(next);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Cleanup preferences and permissions</p>
        </div>
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
      </header>

      {saved && <div className="alert alert-info">Settings saved.</div>}

      <div className="page-body page-body-scroll">
      <div className="grid-2">
        <div className="card">
          <h3>Cleanup</h3>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.dryRunDefault}
              onChange={(e) => setSettings({ ...settings, dryRunDefault: e.target.checked })}
            />
            <span>Dry-run by default (preview without deleting)</span>
          </label>
          <label style={{ marginTop: 16 }}>
            <span className="field-label">Exclude globs (one per line)</span>
            <textarea
              className="textarea"
              rows={6}
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              placeholder="**/.git/**"
            />
          </label>
          <label style={{ marginTop: 16, display: 'block' }}>
            <span className="field-label">Default minimum file size for Big Files scan (MB)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={Math.round((settings.bigFilesMinBytes || 50 * 1024 * 1024) / (1024 * 1024))}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  bigFilesMinBytes: Math.max(1, Number(e.target.value) || 50) * 1024 * 1024,
                })
              }
            />
          </label>
        </div>

        <div className="card">
          <h3>Permissions</h3>
          <p>
            Full Disk Access:{' '}
            <strong className={`status-${perm?.fullDiskAccess || 'unknown'}`}>
              {perm?.fullDiskAccess || 'unknown'}
            </strong>
          </p>
          <p className="muted">
            Grant Full Disk Access in System Settings for complete scans of Mail, Safari, and other
            protected folders.
          </p>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => OpenFullDiskAccessSettings()}>
              Open System Settings
            </button>
            <button className="btn btn-secondary" onClick={() => RefreshPermissions().then(setPerm)}>
              Re-check
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Scan definitions</h3>
          <p className="muted">
            Smart Scan uses <code>catalog.yaml</code>. Download the latest definition from the project
            repository on GitHub, or restore the copy bundled with this app.
          </p>
          {catalogInfo && (
            <ul className="muted" style={{ margin: '12px 0', paddingLeft: 20 }}>
              <li>
                Active: <strong>{catalogInfo.source === 'custom' ? 'Downloaded' : 'Built-in'}</strong>
              </li>
              <li>Categories: {catalogInfo.categoryCount}</li>
              {catalogInfo.updatedAt && <li>Updated: {catalogInfo.updatedAt}</li>}
              {catalogInfo.path && (
                <li>
                  File: <code className="code-block" style={{ display: 'inline', padding: '2px 6px' }}>{catalogInfo.path}</code>
                </li>
              )}
            </ul>
          )}
          {catalogMsg && <div className="alert alert-info alert-compact">{catalogMsg}</div>}
          {catalogErr && <div className="alert alert-warning alert-compact">{catalogErr}</div>}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={catalogBusy}
              onClick={() => void downloadCatalog()}
            >
              {catalogBusy ? 'Working…' : 'Download from GitHub'}
            </button>
            {catalogInfo?.source === 'custom' && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={catalogBusy}
                onClick={() => void resetCatalog()}
              >
                Use built-in catalog
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Audit Log</h3>
          <p className="muted">Deletion actions are logged for review.</p>
          <code className="code-block">{auditPath}</code>
        </div>

        <div className="card">
          <h3>About</h3>
          <p>Mac Cleaner v1.0</p>
          <p className="muted">
            Non-sandboxed macOS maintenance utility. All deletions use Finder Trash for recovery.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
