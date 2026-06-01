import { useCallback, useEffect, useState } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { CancelOperation } from '../../wailsjs/go/main/App';
import type { ScanProgress } from '../types';
import { useOperationProgress } from './useScanProgress';

export function useTrashButton() {
  const { progress, active, kind } = useOperationProgress();
  const [pending, setPending] = useState(false);
  const [expectedTotal, setExpectedTotal] = useState(0);

  const clearPending = useCallback(() => {
    setPending(false);
    setExpectedTotal(0);
  }, []);

  useEffect(() => {
    const finish = () => clearPending();

    const onDeleteProgress = (data: ScanProgress) => {
      if (data.phase === 'done' || data.phase === 'cancelled') {
        clearPending();
      }
    };

    const offCleanup = EventsOn('cleanup:done', finish);
    const offUninstall = EventsOn('uninstall:done', finish);
    const offTrash = EventsOn('trash:done', finish);
    const offCancelled = EventsOn('delete:cancelled', finish);
    const offProgress = EventsOn('delete:progress', onDeleteProgress);

    return () => {
      offCleanup();
      offUninstall();
      offTrash();
      offCancelled();
      offProgress();
    };
  }, [clearPending]);

  const running = pending || (active && kind === 'delete');
  const percent = running ? Math.min(100, Math.max(0, progress?.percent ?? 0)) : 0;
  const scanned = running ? progress?.scanned ?? 0 : 0;
  const total = running ? progress?.total || expectedTotal : 0;

  const runTrashAction = useCallback((action: () => void | Promise<void>, expected?: number) => {
    setExpectedTotal(expected ?? 0);
    setPending(true);
    try {
      const result = action();
      if (result instanceof Promise) {
        void result.catch(() => clearPending());
      }
    } catch (e) {
      clearPending();
      throw e;
    }
  }, [clearPending]);

  const cancelTrashAction = useCallback(() => {
    CancelOperation();
  }, []);

  return { running, percent, scanned, total, runTrashAction, cancelTrashAction, progress };
}
