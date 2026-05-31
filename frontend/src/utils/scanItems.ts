import type { ScanItem } from '../types';
import { model } from '../types';

export type CategoryRow = model.CategorySummary & {
  allSelected: boolean;
};

/** Summarize categories and per-category selection in one pass. */
export function buildCategoryRows(items: ScanItem[]): CategoryRow[] {
  const map = new Map<
    string,
    model.CategorySummary & { selectedCount: number }
  >();
  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) {
      existing.itemCount++;
      existing.sizeBytes += item.sizeBytes;
      if (item.selected) {
        existing.selectedCount++;
      }
    } else {
      map.set(item.category, {
        id: item.category,
        label: item.categoryLabel,
        risk: item.risk,
        itemCount: 1,
        sizeBytes: item.sizeBytes,
        selectedCount: item.selected ? 1 : 0,
      });
    }
  }
  return Array.from(map.values())
    .map(({ selectedCount, ...cat }) => ({
      ...cat,
      allSelected: cat.itemCount > 0 && selectedCount === cat.itemCount,
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
}

export function countSelection(items: ScanItem[]): {
  selectedCount: number;
  selectedBytes: number;
} {
  let selectedCount = 0;
  let selectedBytes = 0;
  for (const item of items) {
    if (item.selected) {
      selectedCount++;
      selectedBytes += item.sizeBytes;
    }
  }
  return { selectedCount, selectedBytes };
}

export function toggleCategorySelection(
  items: ScanItem[],
  categoryId: string,
  selected: boolean
): ScanItem[] {
  let changed = false;
  const next = items.slice();
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    if (item.category !== categoryId || item.selected === selected) {
      continue;
    }
    next[i] = { ...item, selected };
    changed = true;
  }
  return changed ? next : items;
}

export function selectSafeOnly(items: ScanItem[]): ScanItem[] {
  let changed = false;
  const next = items.slice();
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const want = item.risk === 'safe';
    if (item.selected === want) {
      continue;
    }
    next[i] = { ...item, selected: want };
    changed = true;
  }
  return changed ? next : items;
}

export function selectArchivesOnly(items: ScanItem[]): ScanItem[] {
  let changed = false;
  const next = items.slice();
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const want = item.category === 'archives';
    if (item.selected === want) {
      continue;
    }
    next[i] = { ...item, selected: want };
    changed = true;
  }
  return changed ? next : items;
}

export function selectBigFilesOnly(items: ScanItem[]): ScanItem[] {
  let changed = false;
  const next = items.slice();
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const want = item.category === 'big_files';
    if (item.selected === want) {
      continue;
    }
    next[i] = { ...item, selected: want };
    changed = true;
  }
  return changed ? next : items;
}
