import { useCallback, useEffect, useRef, useState } from 'react';
import { GetBigFilesSelectionSummary } from '../../wailsjs/go/main/App';
import type { ScanItem } from '../types';
import { selectedIdsFromItems } from '../utils/scanItems';
import { usePageActive } from './usePageActive';

const LARGE_SCAN = 5000;

export function useBigFilesScanSelection(items: ScanItem[], pageActive: boolean) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const large = items.length > LARGE_SCAN;
  const scanKeyRef = useRef('');

  useEffect(() => {
    if (items.length === 0) {
      scanKeyRef.current = '';
      setSelectedIds(new Set());
      return;
    }
    const key = `${items.length}:${items[0]?.id ?? ''}:${items[items.length - 1]?.id ?? ''}`;
    if (key === scanKeyRef.current) {
      return;
    }
    scanKeyRef.current = key;
    setSelectedIds(selectedIdsFromItems(items));
  }, [items]);

  const [selectionRev, setSelectionRev] = useState(0);
  const bump = useCallback(() => setSelectionRev((v) => v + 1), []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const [summary, setSummary] = useState({ selectedCount: 0, selectedBytes: 0 });
  const summaryCache = useRef(summary);

  useEffect(() => {
    if (!pageActive) {
      return;
    }
    if (large) {
      void GetBigFilesSelectionSummary().then((s) => {
        const next = { selectedCount: s.count, selectedBytes: s.bytes };
        summaryCache.current = next;
        setSummary(next);
      });
      return;
    }
    let count = 0;
    let bytes = 0;
    for (const item of itemsRef.current) {
      if (!selectedIds.has(item.id)) {
        continue;
      }
      count++;
      bytes += item.sizeBytes;
    }
    const next = { selectedCount: count, selectedBytes: bytes };
    summaryCache.current = next;
    setSummary(next);
  }, [pageActive, large, selectedIds, selectionRev]);

  if (!pageActive) {
    return {
      selectedIds,
      setSelectedIds,
      isSelected,
      selectionRev,
      bump,
      ...summaryCache.current,
    };
  }

  return {
    selectedIds,
    setSelectedIds,
    isSelected,
    selectionRev,
    bump,
    selectedCount: summary.selectedCount,
    selectedBytes: summary.selectedBytes,
  };
}
