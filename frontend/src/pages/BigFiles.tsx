import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  CancelScan,
  CleanupLastBigFiles,
  GetBigFilesCategoryRows,
  GetBigFilesDefaults,
  GetLastBigFilesScan,
  PreviewLastBigFiles,
  ScanBigFiles,
  SelectBigFilesArchivesOnly,
  SelectBigFilesLargeOnly,
  SetBigFilesCategorySelected,
  SetBigFilesItemSelected,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { model } from '../types';
import { formatBytes } from '../utils/format';
import {
  applyCategoryToSelectedIds,
  applyIdsToSelectedIds,
  archivesOnlySelectedIds,
  bigFilesOnlySelectedIds,
  buildCategoryRows,
  filterItemsByCategory,
  type CategoryRow,
} from '../utils/scanItems';
import { CategoryListPanel } from '../components/CategoryListPanel';
import { usePageActive } from '../hooks/usePageActive';
import { useBigFilesScanSelection } from '../hooks/useBigFilesScanSelection';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { ScanFileListViewToggle } from '../components/ScanFileListViewToggle';
import { VirtualScanFileList } from '../components/VirtualScanFileList';
import { useScanFileListView } from '../hooks/useScanFileListView';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';

const MB = 1024 * 1024;
const LARGE_SCAN = 5000;

export function BigFiles() {
  const pageActive = usePageActive();
  const { view: fileListView, setView: setFileListView } = useScanFileListView();
  const { bigFiles, setBigFiles, ensureBigFiles } = useScanCache();
  const items = bigFiles ?? [];
  const deferredItems = useDeferredValue(items);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [listGeneration, setListGeneration] = useState(0);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [minSizeMB, setMinSizeMB] = useState(50);
  const [includeBigFiles, setIncludeBigFiles] = useState(true);
  const [includeArchives, setIncludeArchives] = useState(true);
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
  } = useBigFilesScanSelection(items, pageActive);

  const filteredItems = filterItemsByCategory(deferredItems, filterCategoryId);
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
    if (!pageActive) return;
    GetBigFilesDefaults()
      .then((defaults) => {
        if (defaults.minSizeBytes > 0) {
          setMinSizeMB(Math.round(defaults.minSizeBytes / MB));
        }
        setIncludeBigFiles(defaults.includeBigFiles ?? true);
        setIncludeArchives(defaults.includeArchives ?? true);
      })
      .catch(() => {});
  }, [pageActive]);

  useEffect(() => {
    const onDone = (cleanupReport: CleanupReport) => {
      setReport(cleanupReport);
      setError('');
      if (cleanupReport.deleted > 0) {
        void GetLastBigFilesScan().then((fresh) => {
          setBigFiles(fresh || []);
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
      void GetBigFilesCategoryRows().then((rows) => {
        startTransition(() => {
          setCategories(
            rows.map((r) => ({
              id: r.id,
              label: r.label,
              risk: r.risk,
              itemCount: r.itemCount,
              sizeBytes: r.sizeBytes,
              selectedCount: r.selectedCount,
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
  }, [pageActive, items, selectedIds, selectionRev, listGeneration]);

  function buildRequest(): model.BigFilesScanRequest {
    return new model.BigFilesScanRequest({
      roots: [],
      minSizeBytes: 0,
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
      setFilterCategoryId(null);
      setListGeneration((g) => g + 1);
      setReport(null);
    } catch (e: any) {
      setError(e?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }

  async function preview() {
    const r = await PreviewLastBigFiles();
    setReport(r);
  }

  async function handleClean() {
    if (selectedCount === 0) return;
    const choice = await requestConfirm(
      `Remove ${selectedCount} selected item${selectedCount === 1 ? '' : 's'} (${formatBytes(selectedBytes)})`
    );
    if (!choice) {
      return;
    }
    runTrashAction(() => CleanupLastBigFiles(choice === 'permanent'), selectedCount);
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
    SelectBigFilesArchivesOnly();
    setSelectedIds(archivesOnlySelectedIds(items));
    bump();
  }

  function selectBigFiles() {
    SelectBigFilesLargeOnly();
    setSelectedIds(bigFilesOnlySelectedIds(items));
    bump();
  }

  function toggleCat(catId: string, selected: boolean) {
    SetBigFilesCategorySelected(catId, selected);
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
    SetBigFilesItemSelected(id, next);
  }

  function toggleFolder(ids: string[], selected: boolean) {
    setSelectedIds((prev) => applyIdsToSelectedIds(prev, ids, selected));
    for (const id of ids) {
      SetBigFilesItemSelected(id, selected);
    }
    bump();
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
          <p>
            Scans your home directory for large files and archives (minimum size in Settings)
          </p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeBigFiles}
            onChange={(e) => setIncludeBigFiles(e.target.checked)}
            disabled={scanRunning}
          />
          <span>Large files (≥ {minSizeMB} MB)</span>
        </label>
        <label className="checkbox-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={includeArchives}
            onChange={(e) => setIncludeArchives(e.target.checked)}
            disabled={scanRunning}
          />
          <span>Archive files (.zip, .dmg, .pkg, …)</span>
        </label>
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
            <div className="scroll-pane categories-scroll">
              <CategoryListPanel
                categories={categories}
                filterCategoryId={filterCategoryId}
                onFilterChange={setFilterCategoryId}
                onToggleCategory={toggleCat}
                emptyMessage="Press Scan to find large and archive files."
                totalItemCount={items.length}
              />
            </div>
          </div>

          <div className="card card-scroll">
            <div className="scan-files-header">
              <h3>
                Files
                {items.length > 0
                  ? filterCategoryId
                    ? ` (${filteredItems.length} of ${items.length})`
                    : ` (${items.length})`
                    : ''}
              </h3>
              {filteredItems.length > 0 && (
                <ScanFileListViewToggle value={fileListView} onChange={setFileListView} />
              )}
            </div>
            <VirtualScanFileList
              key={`${listGeneration}-${filterCategoryId ?? 'all'}-${fileListView}`}
              view={fileListView}
              items={filteredItems}
              isSelected={isSelected}
              onToggle={toggleItem}
              onToggleFolder={toggleFolder}
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
