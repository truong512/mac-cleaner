import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CancelScan,
  ExecuteCleanup,
  ForceCleanup,
  GetBigFilesDefaults,
  PreviewCleanup,
  ScanBigFiles,
} from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { model } from '../types';
import { formatBytes } from '../utils/format';
import {
  buildCategoryRows,
  countSelection,
  selectArchivesOnly,
  selectBigFilesOnly,
  toggleCategorySelection,
} from '../utils/scanItems';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { RiskBadge } from '../components/RiskBadge';
import { VirtualScanFileList } from '../components/VirtualScanFileList';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';

const MB = 1024 * 1024;

export function BigFiles() {
  const { bigFiles, setBigFiles, ensureBigFiles } = useScanCache();
  const items = bigFiles ?? [];
  const deferredItems = useDeferredValue(items);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [roots, setRoots] = useState('~/Documents\n~/Downloads\n~/Desktop');
  const [minSizeMB, setMinSizeMB] = useState(50);
  const [includeBigFiles, setIncludeBigFiles] = useState(true);
  const [includeArchives, setIncludeArchives] = useState(true);
  const { running, percent, scanned, total, runTrashAction, cancelTrashAction } = useTrashButton();
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();

  const hasResults = items.length > 0;
  const scanRunning = loading || (active && kind === 'scan');
  const cleanRunning = running;
  const actionRunning = scanRunning || cleanRunning;
  const mode = hasResults && !scanRunning ? 'clean' : 'scan';
  const actionPercent = cleanRunning ? percent : progress?.percent ?? 0;
  const actionScanned = cleanRunning ? scanned : progress?.scanned ?? 0;
  const actionTotal = cleanRunning ? total : progress?.total ?? 0;

  useEffect(() => {
    void ensureBigFiles();
  }, []);

  useEffect(() => {
    GetBigFilesDefaults()
      .then((defaults) => {
        if (defaults.roots?.length) {
          setRoots(defaults.roots.map((r) => r.replace(/^\/Users\/[^/]+/, '~')).join('\n'));
        }
        if (defaults.minSizeBytes > 0) {
          setMinSizeMB(Math.round(defaults.minSizeBytes / MB));
        }
        setIncludeBigFiles(defaults.includeBigFiles ?? true);
        setIncludeArchives(defaults.includeArchives ?? true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDone = (report: CleanupReport) => {
      setReport(report);
      if (report.deleted > 0) {
        runScan();
      }
    };
    EventsOn('cleanup:done', onDone);
    return () => EventsOff('cleanup:done');
  }, []);

  const categories = useMemo(() => buildCategoryRows(deferredItems), [deferredItems]);

  const { selectedCount, selectedBytes } = useMemo(
    () => countSelection(items),
    [items]
  );

  function buildRequest(): model.BigFilesScanRequest {
    const rootList = roots
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    return new model.BigFilesScanRequest({
      roots: rootList,
      minSizeBytes: Math.max(1, minSizeMB) * MB,
      includeBigFiles,
      includeArchives,
    });
  }

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await ScanBigFiles(buildRequest());
      setBigFiles(result || []);
      setReport(null);
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }

  async function preview() {
    const r = await PreviewCleanup(items);
    setReport(r);
  }

  async function handleClean() {
    if (selectedCount === 0) return;
    if (
      !(await requestConfirm(
        `Move ${selectedCount} selected item${selectedCount === 1 ? '' : 's'} (${formatBytes(selectedBytes)})`
      ))
    ) {
      return;
    }
    runTrashAction(() => ForceCleanup(items), selectedCount);
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

  function selectArchives() {
    startTransition(() => {
      setBigFiles((prev) => selectArchivesOnly(prev));
    });
  }

  function selectBigFiles() {
    startTransition(() => {
      setBigFiles((prev) => selectBigFilesOnly(prev));
    });
  }

  function toggleCat(catId: string, selected: boolean) {
    startTransition(() => {
      setBigFiles((prev) => toggleCategorySelection(prev, catId, selected));
    });
  }

  function toggleItem(id: string) {
    setBigFiles((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  }

  const actionDisabled =
    actionRunning
      ? false
      : mode === 'scan'
        ? !includeBigFiles && !includeArchives
        : selectedCount === 0;

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Big Files & Archives</h1>
          <p>Find large files and compressed archives taking up space</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="grid-2">
          <label>
            <span className="field-label">Scan folders (one per line)</span>
            <textarea
              className="textarea"
              rows={4}
              value={roots}
              onChange={(e) => setRoots(e.target.value)}
            />
          </label>
          <div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="field-label">Minimum file size (MB)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={minSizeMB}
                onChange={(e) => setMinSizeMB(Number(e.target.value) || 50)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeBigFiles}
                onChange={(e) => setIncludeBigFiles(e.target.checked)}
              />
              <span>Large files (≥ {minSizeMB} MB)</span>
            </label>
            <label className="checkbox-row" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={includeArchives}
                onChange={(e) => setIncludeArchives(e.target.checked)}
              />
              <span>Archive files (.zip, .dmg, .pkg, …)</span>
            </label>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="toolbar card">
          <span>
            <strong>{selectedCount}</strong> selected ·{' '}
            {formatBytes(selectedBytes)} to reclaim
          </span>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={selectArchives} disabled={!items.length}>
              Select Archives
            </button>
            <button className="btn btn-secondary" onClick={selectBigFiles} disabled={!items.length}>
              Select Large Files
            </button>
            <button className="btn btn-secondary" onClick={preview}>
              Preview
            </button>
            <button className="btn btn-secondary" onClick={() => ExecuteCleanup(items).then(setReport)}>
              Dry Run Clean
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="alert alert-info">
          {report.dryRun ? 'Dry run' : 'Cleanup'}: {report.deleted} deleted, {report.failed}{' '}
          failed · {formatBytes(report.totalBytes)} processed
        </div>
      )}

      <div className="page-body">
        <div className="grid-2 grid-fill">
          <div className="card card-scroll">
            <h3>Categories</h3>
            <div className="list">
            {categories.map((cat) => (
              <div key={cat.id} className="list-row">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={cat.allSelected}
                    onChange={(e) => toggleCat(cat.id, e.target.checked)}
                  />
                  <span>{cat.label}</span>
                </label>
                <RiskBadge risk={cat.risk} />
                <span className="muted">{cat.itemCount} items</span>
                <strong>{formatBytes(cat.sizeBytes)}</strong>
              </div>
            ))}
            {!categories.length && <p className="muted">Press Scan to find large and archive files.</p>}
            </div>
          </div>

          <div className="card card-scroll">
            <h3>Files{items.length > 0 ? ` (${items.length})` : ''}</h3>
            <VirtualScanFileList items={deferredItems} onToggle={toggleItem} />
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
