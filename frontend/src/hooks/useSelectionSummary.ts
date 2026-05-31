import { useMemo, useRef } from 'react';
import type { ScanItem } from '../types';
import { countSelection } from '../utils/scanItems';
import { usePageActive } from './usePageActive';

/** Counts selection only while the page is visible — avoids O(n) work on hidden keep-alive tabs. */
export function useSelectionSummary(items: ScanItem[]) {
  const pageActive = usePageActive();
  const cached = useRef({ selectedCount: 0, selectedBytes: 0 });

  return useMemo(() => {
    if (!pageActive) {
      return cached.current;
    }
    const summary = countSelection(items);
    cached.current = summary;
    return summary;
  }, [items, pageActive]);
}
