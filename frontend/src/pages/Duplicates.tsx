import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  CancelScan,
  DeleteDuplicates,
  ScanDuplicates,
  SetDuplicateKeepers,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { CleanupReport } from '../types';
import { model } from '../types';
import { formatBytes } from '../utils/format';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { DuplicateGroupListPanel } from '../components/DuplicateGroupListPanel';
import { DuplicateGroupDetailPanel } from '../components/DuplicateGroupDetailPanel';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';

function extrasInGroup(g: model.DuplicateGroup, keeper: string): number {
  return (g.paths || []).filter((p) => p !== keeper).length;
}

function reclaimableInGroup(g: model.DuplicateGroup, keeper: string): number {
  return g.sizeBytes * extrasInGroup(g, keeper);
}

export function Duplicates() {
  const { duplicates, setDuplicates, setDuplicateKeepers, ensureDuplicates } = useScanCache();
  const groups = duplicates?.groups ?? [];
  const deferredGroups = useDeferredValue(groups);
  const keepers = duplicates?.keepers ?? {};
  const [error, setError] = useState('');
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [checkedHashes, setCheckedHashes] = useState<Set<string>>(() => new Set());
  const cleaningHashesRef = useRef<Set<string>>(new Set());
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

  const selectedGroup =
    groups.find((g) => g.hash === selectedHash) ?? (groups.length > 0 ? groups[0] : null);

  const { checkedCount, checkedExtras, checkedBytes } = useMemo(() => {
    let count = 0;
    let extras = 0;
    let bytes = 0;
    for (const g of groups) {
      if (!checkedHashes.has(g.hash)) continue;
      count++;
      const keeper = keepers[g.hash] || g.keeper;
      const n = extrasInGroup(g, keeper);
      extras += n;
      bytes += reclaimableInGroup(g, keeper);
    }
    return { checkedCount: count, checkedExtras: extras, checkedBytes: bytes };
  }, [groups, checkedHashes, keepers]);

  useEffect(() => {
    void ensureDuplicates();
  }, []);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedHash(null);
      setCheckedHashes(new Set());
      return;
    }
    if (!selectedHash || !groups.some((g) => g.hash === selectedHash)) {
      setSelectedHash(groups[0].hash);
    }
    setCheckedHashes((prev) => {
      const next = new Set<string>();
      for (const h of prev) {
        if (groups.some((g) => g.hash === h)) {
          next.add(h);
        }
      }
      return next;
    });
  }, [groups, selectedHash]);

  useEffect(() => {
    const onDone = (cleanupReport: CleanupReport) => {
      setReport(cleanupReport);
      setError('');
      const cleaned = cleaningHashesRef.current;
      cleaningHashesRef.current = new Set();
      if (cleaned.size === 0 || cleanupReport.deleted === 0 || cleanupReport.failed > 0) {
        return;
      }
      const nextGroups = groups.filter((g) => !cleaned.has(g.hash));
      const nextKeepers = { ...keepers };
      for (const h of cleaned) {
        delete nextKeepers[h];
      }
      setDuplicates(nextGroups, nextKeepers);
      SetDuplicateKeepers(nextKeepers);
      setCheckedHashes((prev) => {
        const next = new Set(prev);
        for (const h of cleaned) {
          next.delete(h);
        }
        return next;
      });
    };
    return EventsOn('cleanup:done', onDone);
  }, [groups, keepers, setDuplicates]);

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await ScanDuplicates([]);
      const list = result || [];
      setDuplicates(list);
      setSelectedHash(list[0]?.hash ?? null);
      setCheckedHashes(new Set());
      SetDuplicateKeepers(
        Object.fromEntries(list.map((g) => [g.hash, g.keeper]))
      );
    } catch (e: any) {
      setError(e?.message || 'Duplicate scan failed');
    } finally {
      setLoading(false);
    }
  }

  function toggleGroupCheck(hash: string, checked: boolean) {
    setCheckedHashes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(hash);
      } else {
        next.delete(hash);
      }
      return next;
    });
  }

  async function handleCleanChecked() {
    const checked = groups.filter((g) => checkedHashes.has(g.hash));
    if (!checked.length) {
      return;
    }
    if (checkedExtras === 0) {
      setError('No duplicate copies to remove in selected groups.');
      return;
    }
    const choice = await requestConfirm(
      `Remove ${checkedExtras} duplicate file${checkedExtras === 1 ? '' : 's'} from ${checked.length} group${checked.length === 1 ? '' : 's'} (${formatBytes(checkedBytes)})`
    );
    if (!choice) {
      return;
    }
    setError('');
    setReport(null);
    SetDuplicateKeepers(keepers);
    const payload = model.DuplicateDeleteRequest.createFrom({
      groups: checked.map((g) =>
        model.DuplicateGroup.createFrom({
          hash: g.hash,
          sizeBytes: g.sizeBytes,
          paths: g.paths,
          keeper: keepers[g.hash] || g.keeper,
        })
      ),
      permanent: choice === 'permanent',
    });
    cleaningHashesRef.current = new Set(checked.map((g) => g.hash));
    runTrashAction(() => DeleteDuplicates(payload), checkedExtras);
  }

  function handlePrimaryAction() {
    if (actionRunning) {
      if (cleanRunning) {
        cancelTrashAction();
      } else {
        CancelScan();
      }
      return;
    }
    if (mode === 'clean') {
      void handleCleanChecked();
      return;
    }
    void runScan();
  }

  const actionDisabled =
    actionRunning ? false : mode === 'clean' ? checkedCount === 0 || checkedExtras === 0 : scanRunning;

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Duplicates</h1>
          <p>Scans your home directory for identical files — remove extra copies</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

      {groups.length > 0 && (
        <div className="toolbar card">
          <span>
            <strong>{checkedCount}</strong> group{checkedCount === 1 ? '' : 's'} selected ·{' '}
            {formatBytes(checkedBytes)} to reclaim
          </span>
        </div>
      )}

      <div className="page-body">
        {groups.length > 0 ? (
          <div className="grid-2 grid-fill">
            <div className="card card-scroll">
              <h3>Groups ({groups.length})</h3>
              <DuplicateGroupListPanel
                groups={deferredGroups}
                keepers={keepers}
                selectedHash={selectedGroup?.hash ?? null}
                checkedHashes={checkedHashes}
                onSelect={setSelectedHash}
                onToggleCheck={toggleGroupCheck}
              />
            </div>

            <div className="card card-scroll">
              <h3>Details</h3>
              {selectedGroup ? (
                <div className="scroll-pane dup-detail-scroll">
                  <DuplicateGroupDetailPanel
                    group={selectedGroup}
                    keeper={keepers[selectedGroup.hash] || selectedGroup.keeper}
                    onSelectKeeper={(path) => {
                      const next = { ...keepers, [selectedGroup.hash]: path };
                      setDuplicateKeepers(next);
                      SetDuplicateKeepers(next);
                    }}
                  />
                </div>
              ) : (
                <p className="muted">Select a group</p>
              )}
            </div>
          </div>
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
