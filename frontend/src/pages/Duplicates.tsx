import { useEffect, useMemo, useState } from 'react';
import { CancelScan, DeleteDuplicates, ScanDuplicates } from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { model } from '../types';
import { formatBytes, basename } from '../utils/format';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';

function buildDeleteRequest(
  groups: model.DuplicateGroup[],
  keepers: Record<string, string>
): model.DuplicateDeleteRequest {
  const payload = groups.map(
    (g) =>
      new model.DuplicateGroup({
        hash: g.hash,
        sizeBytes: g.sizeBytes,
        paths: [...(g.paths || [])],
        keeper: keepers[g.hash] || g.keeper,
      })
  );
  return new model.DuplicateDeleteRequest({ groups: payload });
}

function countExtras(groups: model.DuplicateGroup[], keepers: Record<string, string>): number {
  return groups.reduce((sum, g) => {
    const keeper = keepers[g.hash] || g.keeper;
    return sum + (g.paths || []).filter((p) => p !== keeper).length;
  }, 0);
}

export function Duplicates() {
  const [roots, setRoots] = useState('~/Documents\n~/Downloads\n~/Desktop');
  const [groups, setGroups] = useState<model.DuplicateGroup[]>([]);
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { running, percent, scanned, total, runTrashAction, cancelTrashAction } = useTrashButton();
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();

  const hasResults = groups.length > 0;
  const scanRunning = loading || (active && kind === 'scan');
  const cleanRunning = running;
  const actionRunning = scanRunning || cleanRunning;
  const mode = hasResults && !scanRunning ? 'clean' : 'scan';
  const actionPercent = cleanRunning ? percent : progress?.percent ?? 0;
  const actionScanned = cleanRunning ? scanned : progress?.scanned ?? 0;
  const actionTotal = cleanRunning ? total : progress?.total ?? 0;

  const reclaimable = useMemo(() => {
    return groups.reduce((sum, g) => {
      const keeper = keepers[g.hash] || g.keeper;
      const extras = (g.paths || []).filter((p: string) => p !== keeper).length;
      return sum + g.sizeBytes * extras;
    }, 0);
  }, [groups, keepers]);

  const extraCount = useMemo(
    () => countExtras(groups, keepers),
    [groups, keepers]
  );

  useEffect(() => {
    const onDone = (report: CleanupReport) => {
      setMessage(`Removed ${report.deleted} files (${report.failed} failed)`);
      if (report.deleted > 0) {
        void runScan();
      }
    };
    EventsOn('cleanup:done', onDone);
    return () => EventsOff('cleanup:done');
  }, []);

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const rootList = roots
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const result = await ScanDuplicates(rootList);
      setGroups(result || []);
      const k: Record<string, string> = {};
      for (const g of result || []) k[g.hash] = g.keeper;
      setKeepers(k);
    } catch (e: any) {
      setError(e?.message || 'Duplicate scan failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleClean() {
    if (extraCount === 0) {
      setError('No duplicate copies selected for removal.');
      return;
    }
    if (
      !(await requestConfirm(
        `Remove ${extraCount} duplicate file${extraCount === 1 ? '' : 's'} (${formatBytes(reclaimable)})`
      ))
    ) {
      return;
    }
    setError('');
    setMessage('');
    runTrashAction(() => DeleteDuplicates(buildDeleteRequest(groups, keepers)), extraCount);
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

  const actionDisabled =
    actionRunning ? false : mode === 'clean' ? extraCount === 0 : false;

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Duplicates</h1>
          <p>Find identical files and remove extra copies</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-info">{message}</div>}

      <div className="card">
        <label>
          <span className="field-label">Scan folders (one per line)</span>
          <textarea
            className="textarea"
            rows={4}
            value={roots}
            onChange={(e) => setRoots(e.target.value)}
          />
        </label>
      </div>

      {groups.length > 0 && (
        <div className="toolbar card">
          <span>
            <strong>{groups.length}</strong> duplicate groups ·{' '}
            <strong>{extraCount}</strong> copies to remove · reclaim up to{' '}
            <strong>{formatBytes(reclaimable)}</strong>
          </span>
        </div>
      )}

      <div className="page-body">
        <div className="dup-groups">
        {groups.map((g) => (
          <div key={g.hash} className="card dup-group">
            <div className="dup-header">
              <strong>{formatBytes(g.sizeBytes)}</strong>
              <span className="muted">{g.paths.length} copies</span>
            </div>
            {g.paths.map((p: string) => (
              <label key={p} className="file-row">
                <input
                  type="radio"
                  name={`keeper-${g.hash}`}
                  checked={(keepers[g.hash] || g.keeper) === p}
                  onChange={() => setKeepers((prev) => ({ ...prev, [g.hash]: p }))}
                />
                <span className="file-path">{p}</span>
                <span className="muted">{basename(p)}</span>
              </label>
            ))}
          </div>
        ))}
        {!groups.length && !loading && (
          <p className="muted">Press Scan to find duplicate files.</p>
        )}
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
