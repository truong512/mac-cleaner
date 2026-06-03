import type { DuplicateGroup, InstalledApp, ScanItem } from '../types';
import { model } from '../types';
import type { DiskCache } from '../context/ScanCacheContext';
import { formatBytes } from './format';

export function sumScanItemBytes(items: ScanItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.sizeBytes;
  }
  return total;
}

function reclaimableInGroup(g: model.DuplicateGroup, keeper: string): number {
  const extras = (g.paths || []).filter((p) => p !== keeper).length;
  return g.sizeBytes * extras;
}

export function sumDuplicateReclaimableBytes(
  groups: DuplicateGroup[],
  keepers: Record<string, string>
): number {
  let total = 0;
  for (const g of groups) {
    const keeper = keepers[g.hash] || g.keeper;
    total += reclaimableInGroup(g, keeper);
  }
  return total;
}

export function sumAppBytes(apps: InstalledApp[]): number {
  let total = 0;
  for (const app of apps) {
    total += app.sizeBytes;
  }
  return total;
}

export type NavScanBadgeInput = {
  junk: ScanItem[] | null;
  bigFiles: ScanItem[] | null;
  duplicates: { groups: DuplicateGroup[]; keepers: Record<string, string> } | null;
  apps: InstalledApp[] | null;
  disk: DiskCache | null;
};

/** Map nav paths to formatted byte labels when a scan has results. */
export function navScanBadgeLabels(cache: NavScanBadgeInput): Partial<Record<string, string>> {
  const labels: Partial<Record<string, string>> = {};

  if (cache.junk && cache.junk.length > 0) {
    labels['/junk'] = formatBytes(sumScanItemBytes(cache.junk));
  }

  if (cache.bigFiles && cache.bigFiles.length > 0) {
    labels['/bigfiles'] = formatBytes(sumScanItemBytes(cache.bigFiles));
  }

  if (cache.apps && cache.apps.length > 0) {
    labels['/apps'] = formatBytes(sumAppBytes(cache.apps));
  }

  if (cache.duplicates && cache.duplicates.groups.length > 0) {
    const bytes = sumDuplicateReclaimableBytes(
      cache.duplicates.groups,
      cache.duplicates.keepers
    );
    if (bytes > 0) {
      labels['/duplicates'] = formatBytes(bytes);
    }
  }

  if (cache.disk?.tree && cache.disk.tree.sizeBytes > 0) {
    labels['/disk'] = formatBytes(cache.disk.tree.sizeBytes);
  }

  return labels;
}
