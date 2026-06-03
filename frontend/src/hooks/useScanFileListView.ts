import { useCallback, useState } from 'react';
import {
  loadScanFileListView,
  saveScanFileListView,
  type ScanFileListView,
} from '../utils/scanFileListView';

export function useScanFileListView() {
  const [view, setViewState] = useState<ScanFileListView>(loadScanFileListView);

  const setView = useCallback((next: ScanFileListView) => {
    setViewState(next);
    saveScanFileListView(next);
  }, []);

  return { view, setView };
}
