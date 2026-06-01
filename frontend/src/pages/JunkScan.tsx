import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CancelScan,
  CleanupLastJunk,
  FilterJunkCategoryIDsByTags,
  GetCatalogCategories,
  GetJunkCategoryRows,
  GetLastJunkScan,
  PreviewLastJunk,
  ScanJunk,
  SelectJunkSafeOnly,
  SetJunkCategorySelected,
  SetJunkItemSelected,
} from '../../wailsjs/go/main/App';
import { JunkPresetBar } from '../components/JunkPresetBar';
import { PRESET_EMPTY_HINTS, presetById, type JunkPreset } from '../utils/junkPresets';
import type { CategorySummary } from '../types';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { formatBytes } from '../utils/format';
import {
  applyCategoryToSelectedIds,
  buildCategoryRows,
  filterItemsByCategory,
  safeOnlySelectedIds,
  type CategoryRow,
} from '../utils/scanItems';
import { CategoryListPanel } from '../components/CategoryListPanel';
import { usePageActive } from '../hooks/usePageActive';
import { useJunkScanSelection } from '../hooks/useJunkScanSelection';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { junk, setJunk, ensureJunk } = useScanCache();
  const items = junk ?? [];
  const deferredItems = useDeferredValue(items);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** Remount virtual list when scan results are replaced (fixes row overlap after cleanup). */
  const [listGeneration, setListGeneration] = useState(0);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetCategoryIds, setPresetCategoryIds] = useState<Set<string> | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<CategorySummary[]>([]);
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

  const presetFilteredItems =
    presetCategoryIds && presetCategoryIds.size > 0
      ? deferredItems.filter((i) => presetCategoryIds.has(i.category))
      : deferredItems;
  const filteredItems = filterItemsByCategory(presetFilteredItems, filterCategoryId);
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
    void GetCatalogCategories().then((cats) => setCatalogMeta(cats || []));
  }, []);

  useEffect(() => {
    const presetParam = searchParams.get('preset');
    if (!presetParam) return;
    const preset = presetById(presetParam);
    if (!preset) return;
    void applyPreset(preset, false);
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  async function applyPreset(preset: JunkPreset, updateUrl = true) {
    const catIds = await FilterJunkCategoryIDsByTags(preset.tags);
    setPresetCategoryIds(new Set(catIds));
    setActivePresetId(preset.id);
    setFilterCategoryId(null);
    if (updateUrl) {
      setSearchParams({ preset: preset.id }, { replace: true });
    }
  }

  function clearPreset() {
    setActivePresetId(null);
    setPresetCategoryIds(null);
    setSearchParams({}, { replace: true });
  }

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
  }, [pageActive, items, selectionRev, selectedIds]);

  const displayCategories = useMemo(() => {
    if (!presetCategoryIds || presetCategoryIds.size === 0) {
      return categories;
    }
    const byId = new Map(categories.map((c) => [c.id, c]));
    const merged: CategoryRow[] = [];
    for (const meta of catalogMeta) {
      if (!presetCategoryIds.has(meta.id)) continue;
      const row = byId.get(meta.id);
      if (row) {
        merged.push(row);
      } else {
        merged.push({
          id: meta.id,
          label: meta.label,
          risk: meta.risk as CategoryRow['risk'],
          itemCount: 0,
          sizeBytes: 0,
          selectedCount: 0,
          allSelected: false,
        });
      }
    }
    if (merged.length > 0) {
      return merged;
    }
    return categories.filter((c) => presetCategoryIds.has(c.id));
  }, [categories, catalogMeta, presetCategoryIds]);

  const presetEmptyHint =
    activePresetId && presetFilteredItems.length === 0
      ? PRESET_EMPTY_HINTS[activePresetId]
      : undefined;

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await ScanJunk();
      setJunk(result || []);
      setFilterCategoryId(null);
      setActivePresetId(null);
      setPresetCategoryIds(null);
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
            <JunkPresetBar
              activePresetId={activePresetId}
              disabled={scanRunning}
              onSelect={(p) => void applyPreset(p)}
              onClear={clearPreset}
            />
            <div className="scroll-pane categories-scroll">
              {presetEmptyHint && (
                <div className="alert alert-info alert-compact">{presetEmptyHint}</div>
              )}
              <CategoryListPanel
                categories={displayCategories}
                filterCategoryId={filterCategoryId}
                onFilterChange={setFilterCategoryId}
                onToggleCategory={toggleCat}
                emptyMessage={
                  activePresetId
                    ? 'No categories for this preset. Run Scan after selecting a preset, or clear the filter.'
                    : 'Press Scan to find junk files.'
                }
                totalItemCount={presetCategoryIds?.size ? presetFilteredItems.length : items.length}
              />
            </div>
          </div>

          <div className="card card-scroll">
            <h3>
              Files
              {items.length > 0
                ? filterCategoryId
                  ? ` (${filteredItems.length} of ${items.length})`
                  : ` (${items.length})`
                : ''}
            </h3>
            {filteredItems.length > 0 ? (
              <VirtualScanFileList
                key={`${listGeneration}-${filterCategoryId ?? 'all'}-${activePresetId ?? 'all'}`}
                items={filteredItems}
                isSelected={isSelected}
                onToggle={toggleItem}
              />
            ) : hasResults ? (
              <p className="muted">No files in this filter. Try another preset or clear the filter.</p>
            ) : null}
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
