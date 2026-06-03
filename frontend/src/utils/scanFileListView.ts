export type ScanFileListView = 'tree' | 'flat';

const STORAGE_KEY = 'mac-cleaner.scan-file-list-view';

export function loadScanFileListView(): ScanFileListView {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'tree' || stored === 'flat') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return 'flat';
}

export function saveScanFileListView(view: ScanFileListView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}
