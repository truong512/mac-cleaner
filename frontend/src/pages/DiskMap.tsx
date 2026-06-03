import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BuildDiskTree,
  CancelScan,
  ListDiskChildren,
  PruneDiskPath,
  RevealInFinder,
  TrashPath,
} from '../../wailsjs/go/main/App';
import type { DirNode } from '../types';
import { model } from '../types';
import { formatBytes, basename } from '../utils/format';
import { Treemap } from '../components/Treemap';
import { FolderPathField } from '../components/FolderPathField';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { useTrashButton } from '../hooks/useTrashButton';
import { useOperationProgress } from '../hooks/useScanProgress';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { DeleteResult } from '../types';
import { useScanCache } from '../context/ScanCacheContext';
import {
  collectTopFiles,
  findDirNode,
  normalizePath,
  parentDirPath,
  pruneExpandedMaps,
  subtractBytesFromAncestors,
  resolveDiskNavNode,
  type DiskNavHints,
} from '../utils/dirNode';

export function DiskMap() {
  const { disk, setDisk, setDiskCurrentPath, ensureDisk } = useScanCache();
  const [root, setRoot] = useState(disk?.root ?? '~');
  const tree = disk?.tree ?? null;
  const [current, setCurrent] = useState<DirNode | null>(null);
  const [topFiles, setTopFiles] = useState<DirNode[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const expandedChildrenRef = useRef<Map<string, DirNode[]>>(new Map());
  const navHintsRef = useRef<Map<string, DiskNavHints>>(new Map());
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();
  const {
    running: trashRunning,
    percent: trashPercent,
    scanned: trashScanned,
    total: trashTotal,
    runTrashAction,
    cancelTrashAction,
  } = useTrashButton();

  const resolveNav = useCallback(
    (path: string) =>
      resolveDiskNavNode(
        tree!,
        path,
        expandedChildrenRef.current,
        navHintsRef.current
      ),
    [tree]
  );

  const hasResults = tree != null;
  const scanRunning = loading || (active && kind === 'scan');
  const actionRunning = scanRunning || trashRunning;
  const actionPercent = trashRunning ? trashPercent : progress?.percent ?? 0;
  const actionScanned = trashRunning ? trashScanned : progress?.scanned ?? 0;
  const actionTotal = trashRunning ? trashTotal : progress?.total ?? 0;

  useEffect(() => {
    void ensureDisk();
  }, []);

  useEffect(() => {
    if (!disk?.tree) return;
    setRoot(disk.root);
    setCurrent(
      resolveDiskNavNode(
        disk.tree,
        disk.currentPath,
        expandedChildrenRef.current,
        navHintsRef.current
      )
    );
  }, [disk]);

  useEffect(() => {
    if (!current) {
      setTopFiles([]);
      return;
    }
    setTopFiles(collectTopFiles(current, 15));
  }, [current]);

  async function runScan(keepPath?: string) {
    setError('');
    setLoading(true);
    try {
      const result = await BuildDiskTree(root);
      expandedChildrenRef.current.clear();
      navHintsRef.current.clear();
      const nextPath =
        keepPath && findDirNode(result, keepPath) ? keepPath : result.path;
      const nextNode = resolveDiskNavNode(
        result,
        nextPath,
        expandedChildrenRef.current,
        navHintsRef.current
      );
      setDisk({ root, tree: result, currentPath: nextPath });
      setCurrent(nextNode);
    } catch (e: any) {
      setError(e?.message || 'Failed to build disk map');
    } finally {
      setLoading(false);
    }
  }

  function handlePrimaryAction() {
    if (actionRunning) {
      if (trashRunning) {
        cancelTrashAction();
      } else {
        CancelScan();
      }
      return;
    }
    void runScan();
  }

  function waitForTrash(path: string, permanent: boolean): Promise<DeleteResult> {
    return new Promise((resolve, reject) => {
      const offDone = EventsOn('trash:done', (result: DeleteResult) => {
        offDone();
        offCancelled();
        resolve(result);
      });
      const offCancelled = EventsOn('delete:cancelled', () => {
        offDone();
        offCancelled();
        reject(new Error('Delete cancelled'));
      });
      TrashPath(path, permanent);
    });
  }

  async function drill(node: DirNode) {
    setError('');
    let next = node;
    if (node.isDir && (!node.children || node.children.length === 0)) {
      let children = expandedChildrenRef.current.get(node.path);
      if (!children) {
        setExpanding(true);
        try {
          children = await ListDiskChildren(node.path);
          expandedChildrenRef.current.set(node.path, children || []);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to open folder');
          return;
        } finally {
          setExpanding(false);
        }
      }
      next = model.DirNode.createFrom({ ...node, children: children || [] });
    }
    navHintsRef.current.set(next.path, {
      name: node.name,
      sizeBytes: node.sizeBytes,
    });
    setDiskCurrentPath(next.path);
    setCurrent(next);
  }

  function goUp() {
    if (!current || !tree) return;
    if (current.path === tree.path) return;
    const parentPath = parentDirPath(current.path);
    const next = resolveNav(parentPath);
    setDiskCurrentPath(next.path);
    setCurrent(next);
  }

  async function reveal(path: string) {
    await RevealInFinder(path);
  }

  async function trashItem(item: DirNode) {
    const label = item.isDir
      ? `Remove folder "${item.name}" and its contents (${formatBytes(item.sizeBytes)})`
      : `Remove file "${item.name}"`;
    const choice = await requestConfirm(label);
    if (!choice) {
      return;
    }
    const permanent = choice === 'permanent';

    let keepPath = current?.path;
    if (current && (item.path === current.path || current.path.startsWith(`${item.path}/`))) {
      keepPath = item.path === current.path ? parentDirPath(current.path) : tree?.path;
    }

    if (!tree || !disk) {
      return;
    }

    const snapshotTree = tree;
    const snapshotDisk = disk;

    runTrashAction(async () => {
      try {
        const result = await waitForTrash(item.path, permanent);
        if (!result.success) {
          setError(result.error || (permanent ? 'Failed to delete permanently' : 'Failed to move to Trash'));
          return;
        }

        const wasInTree = !!findDirNode(snapshotTree, item.path);
        pruneExpandedMaps(expandedChildrenRef.current, navHintsRef.current, item.path);

        const parentKey = normalizePath(parentDirPath(item.path));
        const siblings = expandedChildrenRef.current.get(parentKey);
        if (siblings) {
          const hint = navHintsRef.current.get(parentKey);
          if (hint) {
            const sizeBytes = siblings.reduce((s, c) => s + c.sizeBytes, 0);
            navHintsRef.current.set(parentKey, { ...hint, sizeBytes });
          }
        }

        const fromBackend = await PruneDiskPath(item.path);
        const pruned = fromBackend ?? snapshotTree;
        if (!wasInTree) {
          subtractBytesFromAncestors(pruned, item.path, item.sizeBytes);
        }

        const nextPath =
          keepPath &&
          (findDirNode(pruned, keepPath) || expandedChildrenRef.current.has(keepPath))
            ? keepPath
            : pruned.path;

        setDisk({ root: snapshotDisk.root, tree: pruned, currentPath: nextPath });
        setError('');
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'Delete cancelled') {
          return;
        }
        setError(e instanceof Error ? e.message : 'Failed to move to Trash');
      }
    }, 1);
  }

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Space Map</h1>
          <p>Explore disk usage with an interactive treemap</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={actionRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <FolderPathField
          value={root}
          onChange={setRoot}
          disabled={actionRunning}
        />
      </div>

      {current && (
        <div className="page-body">
          <div className="breadcrumb card">
            <button className="btn btn-secondary btn-sm" onClick={goUp} disabled={current.path === tree?.path}>
              ↑ Up
            </button>
            <span className="file-path">{current.path}</span>
            <strong>{formatBytes(current.sizeBytes)}</strong>
            {current.isDir && current.path !== tree?.path && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => trashItem(current)}
                disabled={actionRunning}
              >
                Move to Trash
              </button>
            )}
          </div>

          <div className="grid-2 grid-fill disk-grid">
            <div className="card treemap-card">
              <Treemap node={current} onDrill={(n) => void drill(n)} />
              {expanding && <p className="muted treemap-loading">Loading folder…</p>}
            </div>
            <div className="card card-scroll">
              <h3>Largest Items</h3>
              <div className="scroll-pane">
                {!current.children?.length && !expanding && (
                  <p className="muted">This folder has no breakdown in the scan. Open a subfolder or scan again from here.</p>
                )}
                <div className="file-list">
                  {(current.children || [])
                    .slice()
                    .sort((a: DirNode, b: DirNode) => b.sizeBytes - a.sizeBytes)
                    .slice(0, 20)
                    .map((item: DirNode) => (
                      <div key={item.path} className="file-row-static">
                        <div className="file-meta">
                          <strong>{item.name}</strong>
                          <span className="muted">{item.isDir ? 'folder' : 'file'}</span>
                        </div>
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <div className="btn-row">
                          <button className="btn btn-secondary btn-sm" onClick={() => reveal(item.path)}>
                            Reveal
                          </button>
                          {item.isDir && (
                            <button className="btn btn-secondary btn-sm" onClick={() => drill(item)}>
                              Open
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => trashItem(item)}
                            disabled={actionRunning}
                          >
                            Trash
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                <h3 style={{ marginTop: 24 }}>Top Files Here</h3>
                <div className="file-list">
                  {(topFiles ?? []).map((f) => (
                    <div key={f.path} className="file-row-static">
                      <span className="file-path">{basename(f.path)}</span>
                      <span>{formatBytes(f.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!current && !scanRunning && (
        <div className="card empty-state">
          <p>Enter a root path and press Scan to visualize disk usage.</p>
        </div>
      )}

      <ActionDock>
        <TrashButton
          mode="scan"
          running={actionRunning}
          percent={actionPercent}
          scanned={actionScanned}
          total={actionTotal}
          runningLabel={trashRunning ? 'Moving…' : 'Cancel'}
          disabled={false}
          onClick={handlePrimaryAction}
        />
      </ActionDock>
      {confirmDialog}
    </div>
  );
}
