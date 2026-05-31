import { useCallback, useEffect, useState } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import { CancelOperation } from '../../wailsjs/go/main/App';
import { useOperationProgress } from './useScanProgress';

export function useTrashButton() {
  const { progress, active, kind } = useOperationProgress();
  const [pending, setPending] = useState(false);
  const [expectedTotal, setExpectedTotal] = useState(0);

  useEffect(() => {
    const finish = () => {
      setPending(false);
      setExpectedTotal(0);
    };

    EventsOn('cleanup:done', finish);
    EventsOn('uninstall:done', finish);
    EventsOn('delete:cancelled', finish);
    return () => {
      EventsOff('cleanup:done');
      EventsOff('uninstall:done');
      EventsOff('delete:cancelled');
    };
  }, []);

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
        void result.catch(() => {
          setPending(false);
          setExpectedTotal(0);
        });
      }
    } catch (e) {
      setPending(false);
      setExpectedTotal(0);
      throw e;
    }
  }, []);

  const cancelTrashAction = useCallback(() => {
    CancelOperation();
  }, []);

  return { running, percent, scanned, total, runTrashAction, cancelTrashAction, progress };
}
