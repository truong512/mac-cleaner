import { useEffect, useState } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime';
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

    const offScan = EventsOn('scan:progress', onScanProgress);
    const offDelete = EventsOn('delete:progress', onDeleteProgress);
    const offScanCancelled = EventsOn('scan:cancelled', onScanCancelled);
    const offDeleteCancelled = EventsOn('delete:cancelled', onDeleteCancelled);

    return () => {
      offScan();
      offDelete();
      offScanCancelled();
      offDeleteCancelled();
    };
  }, []);

  return { progress, active, kind, setActive };
}

/** @deprecated use useOperationProgress */
export const useScanProgress = useOperationProgress;
