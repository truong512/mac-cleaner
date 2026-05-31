import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GetLastAppsScan,
  GetLastBigFilesScan,
  GetLastDiskMap,
  GetLastDuplicates,
  GetLastJunkScan,
} from '../../wailsjs/go/main/App';
import type { DirNode, DuplicateGroup, InstalledApp, ScanItem } from '../types';

function keepersFromGroups(groups: DuplicateGroup[]): Record<string, string> {
  const keepers: Record<string, string> = {};
  for (const g of groups) {
    keepers[g.hash] = g.keeper;
  }
  return keepers;
}

export type DiskCache = {
  root: string;
  tree: DirNode;
  currentPath: string;
};

type ScanCacheContextValue = {
  junk: ScanItem[] | null;
  setJunk: (update: ScanItem[] | ((prev: ScanItem[]) => ScanItem[])) => void;
  ensureJunk: () => Promise<ScanItem[]>;

  bigFiles: ScanItem[] | null;
  setBigFiles: (update: ScanItem[] | ((prev: ScanItem[]) => ScanItem[])) => void;
  ensureBigFiles: () => Promise<ScanItem[]>;

  duplicates: { groups: DuplicateGroup[]; keepers: Record<string, string> } | null;
  setDuplicates: (groups: DuplicateGroup[], keepers?: Record<string, string>) => void;
  setDuplicateKeepers: (keepers: Record<string, string>) => void;
  ensureDuplicates: () => Promise<DuplicateGroup[]>;

  apps: InstalledApp[] | null;
  setApps: (apps: InstalledApp[]) => void;
  ensureApps: () => Promise<InstalledApp[]>;

  disk: DiskCache | null;
  setDisk: (disk: DiskCache) => void;
  setDiskCurrentPath: (currentPath: string) => void;
  ensureDisk: () => Promise<DiskCache | null>;
};

const ScanCacheContext = createContext<ScanCacheContextValue | null>(null);

export function ScanCacheProvider({ children }: { children: ReactNode }) {
  const [junk, setJunkState] = useState<ScanItem[] | null>(null);
  const [bigFiles, setBigFilesState] = useState<ScanItem[] | null>(null);
  const [duplicates, setDuplicatesState] = useState<{
    groups: DuplicateGroup[];
    keepers: Record<string, string>;
  } | null>(null);
  const [apps, setAppsState] = useState<InstalledApp[] | null>(null);
  const [disk, setDiskState] = useState<DiskCache | null>(null);

  const junkLoadRef = useRef<Promise<ScanItem[]> | null>(null);
  const bigFilesLoadRef = useRef<Promise<ScanItem[]> | null>(null);
  const duplicatesLoadRef = useRef<Promise<DuplicateGroup[]> | null>(null);
  const appsLoadRef = useRef<Promise<InstalledApp[]> | null>(null);
  const diskLoadRef = useRef<Promise<DiskCache | null> | null>(null);
  const junkFetchedRef = useRef(false);
  const bigFilesFetchedRef = useRef(false);
  const duplicatesFetchedRef = useRef(false);
  const appsFetchedRef = useRef(false);
  const diskFetchedRef = useRef(false);

  const setJunk = useCallback((update: ScanItem[] | ((prev: ScanItem[]) => ScanItem[])) => {
    setJunkState((prev) => {
      const base = prev ?? [];
      return typeof update === 'function' ? update(base) : update;
    });
  }, []);

  const setBigFiles = useCallback((update: ScanItem[] | ((prev: ScanItem[]) => ScanItem[])) => {
    setBigFilesState((prev) => {
      const base = prev ?? [];
      return typeof update === 'function' ? update(base) : update;
    });
  }, []);

  const setDuplicates = useCallback(
    (groups: DuplicateGroup[], keepers?: Record<string, string>) => {
      setDuplicatesState({
        groups,
        keepers: keepers ?? keepersFromGroups(groups),
      });
    },
    []
  );

  const setDuplicateKeepers = useCallback((keepers: Record<string, string>) => {
    setDuplicatesState((prev) => {
      if (!prev) return prev;
      return { ...prev, keepers };
    });
  }, []);

  const setApps = useCallback((list: InstalledApp[]) => {
    setAppsState(list);
  }, []);

  const setDisk = useCallback((next: DiskCache) => {
    setDiskState(next);
  }, []);

  const setDiskCurrentPath = useCallback((currentPath: string) => {
    setDiskState((prev) => (prev ? { ...prev, currentPath } : prev));
  }, []);

  const ensureJunk = useCallback(async () => {
    if (junk !== null || junkFetchedRef.current) {
      return junk ?? [];
    }
    if (!junkLoadRef.current) {
      junkLoadRef.current = GetLastJunkScan()
        .then((items) => {
          junkFetchedRef.current = true;
          const list = items || [];
          setJunkState(list);
          return list;
        })
        .catch(() => {
          junkFetchedRef.current = true;
          setJunkState([]);
          return [];
        })
        .finally(() => {
          junkLoadRef.current = null;
        });
    }
    return junkLoadRef.current;
  }, [junk]);

  const ensureBigFiles = useCallback(async () => {
    if (bigFiles !== null || bigFilesFetchedRef.current) {
      return bigFiles ?? [];
    }
    if (!bigFilesLoadRef.current) {
      bigFilesLoadRef.current = GetLastBigFilesScan()
        .then((items) => {
          bigFilesFetchedRef.current = true;
          const list = items || [];
          setBigFilesState(list);
          return list;
        })
        .catch(() => {
          bigFilesFetchedRef.current = true;
          setBigFilesState([]);
          return [];
        })
        .finally(() => {
          bigFilesLoadRef.current = null;
        });
    }
    return bigFilesLoadRef.current;
  }, [bigFiles]);

  const ensureDuplicates = useCallback(async () => {
    if (duplicates !== null || duplicatesFetchedRef.current) {
      return duplicates?.groups ?? [];
    }
    if (!duplicatesLoadRef.current) {
      duplicatesLoadRef.current = GetLastDuplicates()
        .then((groups) => {
          duplicatesFetchedRef.current = true;
          const list = groups || [];
          setDuplicatesState({ groups: list, keepers: keepersFromGroups(list) });
          return list;
        })
        .catch(() => {
          duplicatesFetchedRef.current = true;
          setDuplicatesState({ groups: [], keepers: {} });
          return [];
        })
        .finally(() => {
          duplicatesLoadRef.current = null;
        });
    }
    return duplicatesLoadRef.current;
  }, [duplicates]);

  const ensureApps = useCallback(async () => {
    if (apps !== null || appsFetchedRef.current) {
      return apps ?? [];
    }
    if (!appsLoadRef.current) {
      appsLoadRef.current = GetLastAppsScan()
        .then((list) => {
          appsFetchedRef.current = true;
          const sorted = list || [];
          setAppsState(sorted);
          return sorted;
        })
        .catch(() => {
          appsFetchedRef.current = true;
          setAppsState([]);
          return [];
        })
        .finally(() => {
          appsLoadRef.current = null;
        });
    }
    return appsLoadRef.current;
  }, [apps]);

  const ensureDisk = useCallback(async () => {
    if (disk !== null || diskFetchedRef.current) {
      return disk;
    }
    if (!diskLoadRef.current) {
      diskLoadRef.current = GetLastDiskMap()
        .then((snapshot) => {
          diskFetchedRef.current = true;
          if (!snapshot?.tree) {
            return null;
          }
          const next: DiskCache = {
            root: snapshot.root || snapshot.tree.path,
            tree: snapshot.tree,
            currentPath: snapshot.tree.path,
          };
          setDiskState(next);
          return next;
        })
        .catch(() => {
          diskFetchedRef.current = true;
          return null;
        })
        .finally(() => {
          diskLoadRef.current = null;
        });
    }
    return diskLoadRef.current;
  }, [disk]);

  const value = useMemo(
    () => ({
      junk,
      setJunk,
      ensureJunk,
      bigFiles,
      setBigFiles,
      ensureBigFiles,
      duplicates,
      setDuplicates,
      setDuplicateKeepers,
      ensureDuplicates,
      apps,
      setApps,
      ensureApps,
      disk,
      setDisk,
      setDiskCurrentPath,
      ensureDisk,
    }),
    [
      junk,
      setJunk,
      ensureJunk,
      bigFiles,
      setBigFiles,
      ensureBigFiles,
      duplicates,
      setDuplicates,
      setDuplicateKeepers,
      ensureDuplicates,
      apps,
      setApps,
      ensureApps,
      disk,
      setDisk,
      setDiskCurrentPath,
      ensureDisk,
    ]
  );

  return <ScanCacheContext.Provider value={value}>{children}</ScanCacheContext.Provider>;
}

export function useScanCache() {
  const ctx = useContext(ScanCacheContext);
  if (!ctx) {
    throw new Error('useScanCache must be used within ScanCacheProvider');
  }
  return ctx;
}
