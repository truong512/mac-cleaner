import { useEffect, useState } from 'react';
import {
  CancelScan,
  GetAppLeftovers,
  ScanApps,
  UninstallApp,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport, InstalledApp, LeftoverFile } from '../types';
import { formatBytes } from '../utils/format';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { TrashButton } from '../components/TrashButton';
import { ActionDock } from '../components/ActionDock';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { AppIcon } from '../components/AppIcon';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';

export function Applications() {
  const { apps: cachedApps, setApps, ensureApps } = useScanCache();
  const apps = cachedApps ?? [];
  const [selected, setSelected] = useState<InstalledApp | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverFile[]>([]);
  const [selectedLeftovers, setSelectedLeftovers] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [loading, setLoading] = useState(false);
  const { running, percent, scanned, total, runTrashAction, cancelTrashAction } = useTrashButton();
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();

  const hasResults = apps.length > 0;
  const scanRunning = loading || (active && kind === 'scan');
  const cleanRunning = running;
  const actionRunning = scanRunning || cleanRunning;
  const mode = hasResults && !scanRunning ? 'clean' : 'scan';
  const actionPercent = cleanRunning ? percent : progress?.percent ?? 0;
  const actionScanned = cleanRunning ? scanned : progress?.scanned ?? 0;
  const actionTotal = cleanRunning ? total : progress?.total ?? 0;

  useEffect(() => {
    if (cachedApps !== null) return;
    void ensureApps().then((list) => setApps(sortApps(list)));
  }, []);

  useEffect(() => {
    const onDone = (cleanupReport: CleanupReport) => {
      setReport(cleanupReport);
      if (cleanupReport.failed > 0) {
        const first = cleanupReport.failures?.[0];
        setError(first?.error || `Could not move ${cleanupReport.failed} item(s) to Trash`);
      } else {
        setError('');
      }
      if (cleanupReport.deleted > 0) {
        setSelected(null);
        setLeftovers([]);
        setSelectedLeftovers(new Set());
        void runScan();
      }
    };
    return EventsOn('uninstall:done', onDone);
  }, []);

  function sortApps(list: InstalledApp[]) {
    return list.filter((a) => !a.systemApp).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function runScan() {
    setError('');
    setLoading(true);
    setSelected(null);
    setLeftovers([]);
    setSelectedLeftovers(new Set());
    try {
      const list = await ScanApps();
      setApps(sortApps(list || []));
    } catch (e: any) {
      setError(e?.message || 'Failed to scan applications');
    } finally {
      setLoading(false);
    }
  }

  async function selectApp(app: InstalledApp) {
    setSelected(app);
    setError('');
    setReport(null);
    setLeftovers([]);
    setSelectedLeftovers(new Set());
    setPreviewLoading(true);
    try {
      const group = await GetAppLeftovers(app.path);
      setLeftovers(group.files || []);
      setSelectedLeftovers(new Set((group.files || []).map((f: LeftoverFile) => f.path)));
    } catch (e: any) {
      setError(e?.message || 'Failed to load uninstall preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleLeftover(path: string) {
    setSelectedLeftovers((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function handleClean() {
    if (!selected) {
      setError('Select an app to uninstall.');
      return;
    }
    const pathCount = 1 + selectedLeftovers.size;
    const choice = await requestConfirm(
      `Uninstall ${selected.name} and remove ${pathCount} item${pathCount === 1 ? '' : 's'}`
    );
    if (!choice) {
      return;
    }
    runTrashAction(
      () =>
        UninstallApp({
          appPath: selected.path,
          leftoverPaths: Array.from(selectedLeftovers),
          permanent: choice === 'permanent',
        }).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Uninstall failed';
          setError(msg);
        }),
      pathCount
    );
  }

  function handlePrimaryAction() {
    if (actionRunning) {
      if (cleanRunning) cancelTrashAction();
      else CancelScan();
      return;
    }
    if (!hasResults) {
      void runScan();
      return;
    }
    void handleClean();
  }

  const actionDisabled = actionRunning ? false : mode === 'clean' ? !selected : false;

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Scan installed apps and remove them along with leftover files</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

      <div className="page-body">
        <div className="grid-2 grid-fill">
          <div className="card card-scroll">
            <h3>Installed Apps ({apps.length})</h3>
            <div className="app-list">
            {apps.map((app) => (
              <button
                key={app.path}
                className={`app-row ${selected?.path === app.path ? 'selected' : ''}`}
                onClick={() => selectApp(app)}
                disabled={!hasResults || scanRunning}
              >
                <AppIcon appPath={app.path} name={app.name} />
                <div className="app-row-meta">
                  <strong>{app.name}</strong>
                  <span className="muted">{app.version || app.bundleId}</span>
                </div>
                <span className="app-row-size">{formatBytes(app.sizeBytes)}</span>
              </button>
            ))}
            {!apps.length && !scanRunning && (
              <p className="muted">Press Scan to find installed applications.</p>
            )}
            </div>
          </div>

          <div className="card card-scroll">
            <h3>Uninstall Preview</h3>
          {!selected && (
            <p className="muted">
              {hasResults
                ? 'Select an app to preview files that will be removed.'
                : 'Scan first to list installed applications.'}
            </p>
          )}
          {selected && (
            <>
              <div className="preview-header">
                <strong>{selected.name}</strong>
                <span className="muted">{selected.path}</span>
              </div>
              <p className="muted">App bundle will be removed along with selected leftovers.</p>
              {previewLoading && <p className="muted">Loading leftover files...</p>}
              {!previewLoading && (
                <div className="file-list">
                  <label className="file-row">
                    <input type="checkbox" checked readOnly />
                    <span className="file-path">{selected.path}</span>
                    <span>{formatBytes(selected.sizeBytes)}</span>
                  </label>
                  {leftovers.map((f) => (
                    <label key={f.path} className="file-row">
                      <input
                        type="checkbox"
                        checked={selectedLeftovers.has(f.path)}
                        onChange={() => toggleLeftover(f.path)}
                      />
                      <div className="file-meta">
                        <span className="file-path">{f.path}</span>
                        <span className="muted">{f.kind}</span>
                      </div>
                      <span>{formatBytes(f.sizeBytes)}</span>
                    </label>
                  ))}
                  {!leftovers.length && <p className="muted">No common leftovers found.</p>}
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      <ActionDock>
        <TrashButton
          mode={mode}
          running={actionRunning}
          percent={actionPercent}
          scanned={actionScanned}
          total={actionTotal}
          disabled={actionDisabled}
          onClick={handlePrimaryAction}
        />
      </ActionDock>
      {confirmDialog}
    </div>
  );
}
