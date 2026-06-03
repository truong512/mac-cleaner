import { useEffect, useMemo } from 'react';
import { useScanCache } from '../context/ScanCacheContext';
import { navScanBadgeLabels } from '../utils/navScanBadges';

/** Loads persisted scans and derives sidebar byte badges per route. */
export function useNavScanBadges(): Partial<Record<string, string>> {
  const { junk, bigFiles, duplicates, apps, disk, ensureJunk, ensureBigFiles, ensureDuplicates, ensureApps, ensureDisk } =
    useScanCache();

  useEffect(() => {
    void ensureJunk();
    void ensureBigFiles();
    void ensureDuplicates();
    void ensureApps();
    void ensureDisk();
  }, [ensureJunk, ensureBigFiles, ensureDuplicates, ensureApps, ensureDisk]);

  return useMemo(
    () => navScanBadgeLabels({ junk, bigFiles, duplicates, apps, disk }),
    [junk, bigFiles, duplicates, apps, disk]
  );
}
