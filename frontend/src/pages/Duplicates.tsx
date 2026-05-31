import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  CancelScan,
  CleanupLastDuplicates,
  ScanDuplicates,
  SetDuplicateKeepers,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { model } from '../types';
import { formatBytes } from '../utils/format';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { VirtualDuplicateGroupList } from '../components/VirtualDuplicateGroupList';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { FolderPathsField } from '../components/FolderPathsField';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';
import { usePageActive } from '../hooks/usePageActive';

function countExtras(groups: model.DuplicateGroup[], keepers: Record<string, string>): number {
  return groups.reduce((sum, g) => {
    const keeper = keepers[g.hash] || g.keeper;
    return sum + (g.paths || []).filter((p) => p !== keeper).length;
  }, 0);
}

export function Duplicates() {
  const pageActive = usePageActive();
  const { duplicates, setDuplicates, setDuplicateKeepers, ensureDuplicates } = useScanCache();
  const groups = duplicates?.groups ?? [];
  const deferredGroups = useDeferredValue(groups);
  const keepers = duplicates?.keepers ?? {};
  const [roots, setRoots] = useState('~/Documents\n~/Downloads\n~/Desktop');
  const [error, setError] = useState('');
  const [report, setReport] = useState<CleanupReport | null>(null);
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
    if (!pageActive) return 0;
    return deferredGroups.reduce((sum, g) => {
      const keeper = keepers[g.hash] || g.keeper;
      const extras = (g.paths || []).filter((p: string) => p !== keeper).length;
      return sum + g.sizeBytes * extras;
    }, 0);
  }, [deferredGroups, keepers, pageActive]);

  const extraCountRef = useRef(0);
  const extraCount = useMemo(() => {
    if (!pageActive) {
      return extraCountRef.current;
    }
    const n = countExtras(deferredGroups, keepers);
    extraCountRef.current = n;
    return n;
  }, [deferredGroups, keepers, pageActive]);

  useEffect(() => {
    void ensureDuplicates();
  }, []);

  useEffect(() => {
    const onDone = (cleanupReport: CleanupReport) => {
      setReport(cleanupReport);
      setError('');
    };
    return EventsOn('cleanup:done', onDone);
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
      const list = result || [];
      setDuplicates(list);
      SetDuplicateKeepers(
        Object.fromEntries(list.map((g) => [g.hash, g.keeper]))
      );
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
    setReport(null);
    SetDuplicateKeepers(keepers);
    runTrashAction(() => CleanupLastDuplicates(), extraCount);
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
      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

      <div className="card">
        <FolderPathsField value={roots} onChange={setRoots} disabled={scanRunning} />
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
        {groups.length > 0 ? (
          <VirtualDuplicateGroupList
            groups={deferredGroups}
            keepers={keepers}
            onSelectKeeper={(hash, path) => {
              const next = { ...keepers, [hash]: path };
              setDuplicateKeepers(next);
              SetDuplicateKeepers(next);
            }}
          />
        ) : (
          !loading && <p className="muted dup-empty">Press Scan to find duplicate files.</p>
        )}
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
