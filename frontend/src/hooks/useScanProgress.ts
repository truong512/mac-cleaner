import { useEffect, useState } from 'react';
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';
import type { ScanProgress } from '../types';

export type OperationKind = 'scan' | 'delete';

export function useOperationProgress() {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [active, setActive] = useState(false);
  const [kind, setKind] = useState<OperationKind>('scan');

  useEffect(() => {
    const finish = (data: ScanProgress) => {
      if (data.phase === 'done' || data.phase === 'cancelled') {
        setTimeout(() => {
          setActive(false);
          setProgress(null);
        }, 400);
      }
    };

    const onScanProgress = (data: ScanProgress) => {
      setKind('scan');
      setActive(true);
      setProgress(data);
      finish(data);
    };

    const onDeleteProgress = (data: ScanProgress) => {
      setKind('delete');
      setActive(true);
      setProgress(data);
      finish(data);
    };

    const onScanCancelled = () => {
      setActive(false);
      setProgress(null);
    };

    const onDeleteCancelled = () => {
      setActive(false);
      setProgress(null);
    };

    EventsOn('scan:progress', onScanProgress);
    EventsOn('delete:progress', onDeleteProgress);
    EventsOn('scan:cancelled', onScanCancelled);
    EventsOn('delete:cancelled', onDeleteCancelled);
    return () => {
      EventsOff('scan:progress');
      EventsOff('delete:progress');
      EventsOff('scan:cancelled');
      EventsOff('delete:cancelled');
    };
  }, []);

  return { progress, active, kind, setActive };
}

/** @deprecated use useOperationProgress */
export const useScanProgress = useOperationProgress;
