import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  CancelScan,
  CleanupLastJunk,
  GetJunkCategoryRows,
  GetLastJunkScan,
  PreviewLastJunk,
  ScanJunk,
  SelectJunkSafeOnly,
  SetJunkCategorySelected,
  SetJunkItemSelected,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { formatBytes } from '../utils/format';
import {
  applyCategoryToSelectedIds,
  buildCategoryRows,
  safeOnlySelectedIds,
  type CategoryRow,
} from '../utils/scanItems';
import { usePageActive } from '../hooks/usePageActive';
import { useJunkScanSelection } from '../hooks/useJunkScanSelection';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { RiskBadge } from '../components/RiskBadge';
import { VirtualScanFileList } from '../components/VirtualScanFileList';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';

const LARGE_SCAN = 5000;

export function JunkScan() {
  const pageActive = usePageActive();
  const { junk, setJunk, ensureJunk } = useScanCache();
  const items = junk ?? [];
  const deferredItems = useDeferredValue(items);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** Remount virtual list when scan results are replaced (fixes row overlap after cleanup). */
  const [listGeneration, setListGeneration] = useState(0);
  const { running, percent, scanned, total, runTrashAction, cancelTrashAction } = useTrashButton();
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();

  const {
    selectedIds,
    setSelectedIds,
    isSelected,
    selectionRev,
    bump,
    selectedCount,
    selectedBytes,
  } = useJunkScanSelection(items, pageActive);

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
    const onDone = (cleanupReport: CleanupReport) => {
      setReport(cleanupReport);
      setError('');
      if (cleanupReport.deleted > 0) {
        void GetLastJunkScan().then((fresh) => {
          setJunk(fresh || []);
          setListGeneration((g) => g + 1);
        });
      }
    };
    return EventsOn('cleanup:done', onDone);
  }, []);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  useEffect(() => {
    if (!pageActive) return;
    if (items.length > LARGE_SCAN) {
      void GetJunkCategoryRows().then((rows) => {
        startTransition(() => {
          setCategories(
            rows.map((r) => ({
              id: r.id,
              label: r.label,
              risk: r.risk,
              itemCount: r.itemCount,
              sizeBytes: r.sizeBytes,
              allSelected: r.allSelected,
            }))
          );
        });
      });
      return;
    }
    startTransition(() => {
      setCategories(buildCategoryRows(items, selectedIds));
    });
  }, [pageActive, items, selectionRev, selectedIds]);

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await ScanJunk();
      setJunk(result || []);
      setListGeneration((g) => g + 1);
      setReport(null);
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }

  async function preview() {
    const r = await PreviewLastJunk();
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
    runTrashAction(() => CleanupLastJunk(), selectedCount);
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
    SelectJunkSafeOnly();
    setSelectedIds(safeOnlySelectedIds(items));
    bump();
  }

  function toggleCat(catId: string, selected: boolean) {
    SetJunkCategorySelected(catId, selected);
    setSelectedIds((prev) => applyCategoryToSelectedIds(items, prev, catId, selected));
    bump();
  }

  function toggleItem(id: string) {
    const next = !isSelected(id);
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (next) {
        s.add(id);
      } else {
        s.delete(id);
      }
      return s;
    });
    SetJunkItemSelected(id, next);
    bump();
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
            <button className="btn btn-secondary" onClick={() => void preview()}>
              Dry Run Clean
            </button>
          </div>
        </div>
      )}

      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

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
            <VirtualScanFileList
              key={listGeneration}
              items={deferredItems}
              isSelected={isSelected}
              onToggle={toggleItem}
            />
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
