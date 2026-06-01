import type { DuplicateGroup, ScanItem } from '../types';
import { model } from '../types';

/** Items marked for cleanup (avoids sending full scan results over Wails). */
export function getSelectedItems(items: ScanItem[]): ScanItem[] {
  const selected: ScanItem[] = [];
  for (const item of items) {
    if (item.selected) {
      selected.push(item);
    }
  }
  return selected;
}

/** Paths only — minimal payload for trash operations. */
export function getSelectedIDs(items: ScanItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.selected) {
      ids.push(item.id);
    }
  }
  return ids;
}

export function getSelectedPaths(items: ScanItem[]): string[] {
  const paths: string[] = [];
  for (const item of items) {
    if (item.selected) {
      paths.push(item.path);
    }
  }
  return paths;
}

export function collectDuplicatePathsToDelete(
  groups: DuplicateGroup[],
  keepers: Record<string, string>
): string[] {
  const paths: string[] = [];
  for (const g of groups) {
    const keeper = keepers[g.hash] || g.keeper;
    for (const p of g.paths || []) {
      if (p !== keeper) {
        paths.push(p);
      }
    }
  }
  return paths;
}

export type CategoryRow = model.CategorySummary & {
  selectedCount: number;
  allSelected: boolean;
};

/** Summarize categories and per-category selection in one pass. */
export function filterItemsByCategory(
  items: ScanItem[],
  categoryId: string | null
): ScanItem[] {
  if (!categoryId) {
    return items;
  }
  return items.filter((item) => item.category === categoryId);
}

export function buildCategoryRows(
  items: ScanItem[],
  selectedIds?: ReadonlySet<string>
): CategoryRow[] {
  const map = new Map<
    string,
    model.CategorySummary & { selectedCount: number }
  >();
  for (const item of items) {
    const selected = selectedIds ? selectedIds.has(item.id) : item.selected;
    const existing = map.get(item.category);
    if (existing) {
      existing.itemCount++;
      existing.sizeBytes += item.sizeBytes;
      if (selected) {
        existing.selectedCount++;
      }
    } else {
      map.set(item.category, {
        id: item.category,
        label: item.categoryLabel,
        risk: item.risk,
        itemCount: 1,
        sizeBytes: item.sizeBytes,
        selectedCount: selected ? 1 : 0,
      });
    }
  }
  return Array.from(map.values())
    .map(({ selectedCount, ...cat }) => ({
      ...cat,
      selectedCount,
      allSelected: cat.itemCount > 0 && selectedCount === cat.itemCount,
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
}

export function selectedIdsFromItems(items: ScanItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.selected) {
      ids.add(item.id);
    }
  }
  return ids;
}

export function applyCategoryToSelectedIds(
  items: ScanItem[],
  selectedIds: Set<string>,
  categoryId: string,
  selected: boolean
): Set<string> {
  const next = new Set(selectedIds);
  for (const item of items) {
    if (item.category !== categoryId) {
      continue;
    }
    if (selected) {
      next.add(item.id);
    } else {
      next.delete(item.id);
    }
  }
  return next;
}

export function safeOnlySelectedIds(items: ScanItem[]): Set<string> {
  const next = new Set<string>();
  for (const item of items) {
    if (item.risk === 'safe') {
      next.add(item.id);
    }
  }
  return next;
}

export function archivesOnlySelectedIds(items: ScanItem[]): Set<string> {
  const next = new Set<string>();
  for (const item of items) {
    if (item.category === 'archives') {
      next.add(item.id);
    }
  }
  return next;
}

export function bigFilesOnlySelectedIds(items: ScanItem[]): Set<string> {
  const next = new Set<string>();
  for (const item of items) {
    if (item.category === 'big_files') {
      next.add(item.id);
    }
  }
  return next;
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
