import { useEffect, useState } from 'react';
import {
  BuildDiskTree,
  CancelScan,
  GetTopFiles,
  RevealInFinder,
  TrashPath,
} from '../../wailsjs/go/main/App';
import type { DirNode } from '../types';
import { formatBytes, basename } from '../utils/format';
import { Treemap } from '../components/Treemap';
import { FolderPathField } from '../components/FolderPathField';
import { ActionDock } from '../components/ActionDock';
import { TrashButton } from '../components/TrashButton';
import { useConfirmTrash } from '../hooks/useConfirmTrash';
import { useOperationProgress } from '../hooks/useScanProgress';
import { useScanCache } from '../context/ScanCacheContext';
import { findDirNode } from '../utils/dirNode';

export function DiskMap() {
  const { disk, setDisk, setDiskCurrentPath, ensureDisk } = useScanCache();
  const [root, setRoot] = useState(disk?.root ?? '~');
  const tree = disk?.tree ?? null;
  const [current, setCurrent] = useState<DirNode | null>(null);
  const [topFiles, setTopFiles] = useState<DirNode[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { progress, active, kind } = useOperationProgress();
  const { requestConfirm, confirmDialog } = useConfirmTrash();

  const hasResults = tree != null;
  const scanRunning = loading || (active && kind === 'scan');
  const actionPercent = progress?.percent ?? 0;
  const actionScanned = progress?.scanned ?? 0;
  const actionTotal = progress?.total ?? 0;

  useEffect(() => {
    void ensureDisk();
  }, []);

  useEffect(() => {
    if (!disk) return;
    setRoot(disk.root);
    setCurrent(findDirNode(disk.tree, disk.currentPath) ?? disk.tree);
  }, [disk]);

  useEffect(() => {
    if (current) {
      GetTopFiles(current.path, 15).then(setTopFiles).catch(() => setTopFiles([]));
    }
  }, [current]);

  async function runScan() {
    setError('');
    setLoading(true);
    try {
      const result = await BuildDiskTree(root);
      setDisk({ root, tree: result, currentPath: result.path });
      setCurrent(result);
    } catch (e: any) {
      setError(e?.message || 'Failed to build disk map');
    } finally {
      setLoading(false);
    }
  }

  function handlePrimaryAction() {
    if (scanRunning) {
      CancelScan();
      return;
    }
    void runScan();
  }

  function drill(node: DirNode) {
    setDiskCurrentPath(node.path);
    setCurrent(node);
  }

  function goUp() {
    if (!current || !tree) return;
    if (current.path === tree.path) return;
    const parentPath = current.path.split('/').slice(0, -1).join('/') || '/';
    const parent = findDirNode(tree, parentPath) || tree;
    setDiskCurrentPath(parent.path);
    setCurrent(parent);
  }

  async function reveal(path: string) {
    await RevealInFinder(path);
  }

  async function trash(path: string) {
    if (!(await requestConfirm(basename(path)))) return;
    await TrashPath(path);
    await runScan();
  }

  return (
    <div className="page page-with-dock">
      <header className="page-header">
        <div>
          <h1>Space Map</h1>
          <p>Explore disk usage with an interactive treemap</p>
        </div>
        {hasResults && (
          <button className="btn btn-secondary" onClick={() => runScan()} disabled={scanRunning}>
            Scan Again
          </button>
        )}
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <FolderPathField
          value={root}
          onChange={setRoot}
          disabled={scanRunning}
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
          </div>

          <div className="grid-2 grid-fill disk-grid">
            <div className="card treemap-card">
              <Treemap node={current} onDrill={drill} />
            </div>
            <div className="card card-scroll">
              <h3>Largest Items</h3>
              <div className="scroll-pane">
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
                          {!item.isDir && (
                            <button className="btn btn-danger btn-sm" onClick={() => trash(item.path)}>
                              Trash
                            </button>
                          )}
                          {item.isDir && (
                            <button className="btn btn-secondary btn-sm" onClick={() => drill(item)}>
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                <h3 style={{ marginTop: 24 }}>Top Files Here</h3>
                <div className="file-list">
                  {topFiles.map((f) => (
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
          running={scanRunning}
          percent={actionPercent}
          scanned={actionScanned}
          total={actionTotal}
          disabled={false}
          onClick={handlePrimaryAction}
        />
      </ActionDock>
      {confirmDialog}
    </div>
  );
}
