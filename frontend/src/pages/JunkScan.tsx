import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CancelScan,
  ExecuteCleanup,
  ForceCleanup,
  PreviewCleanup,
  ScanJunk,
} from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { formatBytes } from '../utils/format';
import {
  buildCategoryRows,
  countSelection,
  selectSafeOnly,
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

export function JunkScan() {
  const { junk, setJunk, ensureJunk } = useScanCache();
  const items = junk ?? [];
  const deferredItems = useDeferredValue(items);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    void ensureJunk();
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

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await ScanJunk();
      setJunk(result || []);
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

  function selectSafe() {
    startTransition(() => {
      setJunk((prev) => selectSafeOnly(prev));
    });
  }

  function toggleCat(catId: string, selected: boolean) {
    startTransition(() => {
      setJunk((prev) => toggleCategorySelection(prev, catId, selected));
    });
  }

  function toggleItem(id: string) {
    setJunk((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  }

  const actionDisabled =
    actionRunning
      ? false
      : mode === 'clean'
        ? selectedCount === 0
        : false;

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Smart Scan</h1>
          <p>Review junk files before moving them to Trash</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={selectSafe} disabled={!items.length}>
            Select Safe Only
          </button>
          {hasResults && (
            <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
              Scan Again
            </button>
          )}
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {items.length > 0 && (
        <div className="toolbar card">
          <span>
            <strong>{selectedCount}</strong> selected ·{' '}
            {formatBytes(selectedBytes)} to reclaim
          </span>
          <div className="btn-row">
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
            {!categories.length && <p className="muted">Press Scan to find junk files.</p>}
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
