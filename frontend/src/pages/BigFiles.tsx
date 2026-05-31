import { useEffect, useMemo, useState } from 'react';
import {
  CancelScan,
  ExecuteCleanup,
  ForceCleanup,
  GetBigFilesDefaults,
  GetLastBigFilesScan,
  PreviewCleanup,
  ScanBigFiles,
  SelectArchivesOnly,
  SelectBigFilesOnly,
  ToggleCategory,
} from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import type { CleanupReport, ScanItem } from '../types';
import { model } from '../types';
import { formatBytes } from '../utils/format';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { RiskBadge } from '../components/RiskBadge';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';

const MB = 1024 * 1024;

export function BigFiles() {
  const [items, setItems] = useState<ScanItem[]>([]);
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
    GetLastBigFilesScan()
      .then((items) => setItems(items || []))
      .catch(() => {});
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

  const categories = useMemo(() => {
    const map = new Map<string, model.CategorySummary>();
    for (const item of items) {
      const existing = map.get(item.category);
      if (existing) {
        existing.itemCount++;
        existing.sizeBytes += item.sizeBytes;
      } else {
        map.set(item.category, {
          id: item.category,
          label: item.categoryLabel,
          risk: item.risk,
          itemCount: 1,
          sizeBytes: item.sizeBytes,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
  }, [items]);

  const selectedBytes = useMemo(
    () => items.filter((i) => i.selected).reduce((s, i) => s + i.sizeBytes, 0),
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
      setItems(result || []);
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
    const selectedCount = items.filter((i) => i.selected).length;
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

  async function selectArchives() {
    const updated = await SelectArchivesOnly(items);
    setItems(updated);
  }

  async function selectBigFiles() {
    const updated = await SelectBigFilesOnly(items);
    setItems(updated);
  }

  async function toggleCat(catId: string, selected: boolean) {
    const updated = await ToggleCategory(items, catId, selected);
    setItems(updated);
  }

  function toggleItem(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  }

  const actionDisabled =
    actionRunning
      ? false
      : mode === 'scan'
        ? !includeBigFiles && !includeArchives
        : !items.some((i) => i.selected);

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
            <strong>{items.filter((i) => i.selected).length}</strong> selected ·{' '}
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
                    checked={items.filter((i) => i.category === cat.id).every((i) => i.selected)}
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
            <h3>Files</h3>
            <div className="file-list">
            {items.slice(0, 300).map((item) => (
              <label key={item.id} className="file-row">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleItem(item.id)}
                />
                <div className="file-meta">
                  <span className="file-path">{item.path}</span>
                  <span className="muted">{item.categoryLabel}</span>
                </div>
                <RiskBadge risk={item.risk} />
                <span>{formatBytes(item.sizeBytes)}</span>
              </label>
            ))}
            {items.length > 300 && (
              <p className="muted">Showing first 300 of {items.length} items (sorted by size)</p>
            )}
            </div>
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
