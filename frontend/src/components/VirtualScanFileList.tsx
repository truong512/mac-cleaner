import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GetPermissionStatus } from '../../wailsjs/go/main/App';
import type { ScanItem } from '../types';
import type { ScanFileListView } from '../utils/scanFileListView';
import { formatBytes } from '../utils/format';
import {
  buildScanItemTree,
  inferHomeDirFromItems,
  collectFileIdsInTree,
  collectFolderPaths,
  flattenScanTree,
  folderCheckState,
  type ScanTreeNode,
} from '../utils/scanItemTree';
import { RiskBadge } from './RiskBadge';

const FILE_ROW_ESTIMATE_PX = 56;
const FOLDER_ROW_ESTIMATE_PX = 48;

type Props = {
  items: ScanItem[];
  view: ScanFileListView;
  onToggle: (id: string) => void;
  onToggleFolder: (ids: string[], selected: boolean) => void;
  isSelected?: (id: string) => boolean;
};

function rowKey(node: ScanTreeNode): string {
  return node.kind === 'file' && node.item ? node.item.id : node.path;
}

function rowEstimate(node: ScanTreeNode): number {
  return node.kind === 'file' ? FILE_ROW_ESTIMATE_PX : FOLDER_ROW_ESTIMATE_PX;
}

function isExpandableFolder(node: ScanTreeNode): boolean {
  return node.kind === 'folder' || node.kind === 'home';
}

function FolderSelectCheckbox({
  node,
  isSelected,
  onToggleFolder,
}: {
  node: ScanTreeNode;
  isSelected: (id: string) => boolean;
  onToggleFolder: (ids: string[], selected: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const ids = useMemo(() => collectFileIdsInTree(node), [node]);
  const { checked, indeterminate } = folderCheckState(node, isSelected);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, checked, ids.length]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={ids.length === 0}
      aria-label={
        node.kind === 'home' ? 'Select all in home directory' : `Select all in ${node.name}`
      }
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onToggleFolder(ids, e.target.checked);
      }}
    />
  );
}

function VirtualScanFileTreeList({
  items,
  onToggle,
  onToggleFolder,
  isSelected,
}: Omit<Props, 'view'>) {
  const rowSelected = isSelected ?? ((id: string) => items.find((i) => i.id === id)?.selected ?? false);
  const parentRef = useRef<HTMLDivElement>(null);
  const [homeDir, setHomeDir] = useState<string | undefined>();

  useEffect(() => {
    void GetPermissionStatus().then((p) => {
      if (p.homeDir) {
        setHomeDir(p.homeDir);
      }
    });
  }, []);

  const effectiveHomeDir = homeDir ?? inferHomeDirFromItems(items);
  const tree = useMemo(
    () => buildScanItemTree(items, effectiveHomeDir),
    [items, effectiveHomeDir]
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpanded(new Set(collectFolderPaths(tree)));
  }, [tree]);

  const flatRows = useMemo(() => flattenScanTree(tree, expanded), [tree, expanded]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const node = flatRows[index]?.node;
      return node ? rowEstimate(node) : FILE_ROW_ESTIMATE_PX;
    },
    overscan: 8,
    getItemKey: (index) => {
      const node = flatRows[index]?.node;
      return node ? rowKey(node) : index;
    },
  });

  function toggleFolderExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div ref={parentRef} className="file-list virtual-file-list scan-file-tree">
      <div
        className="virtual-file-list-inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) {
            return null;
          }
          const { node, depth } = row;
          const indent = depth * 16 + 4;

          if (isExpandableFolder(node)) {
            const isHome = node.kind === 'home';
            const isOpen = expanded.has(node.path);
            const expandLabel = isHome
              ? isOpen
                ? 'Collapse home'
                : 'Expand home'
              : isOpen
                ? `Collapse ${node.name}`
                : `Expand ${node.name}`;
            return (
              <div
                key={rowKey(node)}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="virtual-file-row"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={`tree-folder-row${isHome ? ' tree-folder-row--home' : ''}`}
                  style={{ paddingLeft: `${indent}px` }}
                  title={node.path}
                >
                  <FolderSelectCheckbox
                    node={node}
                    isSelected={rowSelected}
                    onToggleFolder={onToggleFolder}
                  />
                  <button
                    type="button"
                    className="tree-chevron-btn"
                    aria-expanded={isOpen}
                    aria-label={expandLabel}
                    onClick={() => toggleFolderExpand(node.path)}
                  >
                    <span className="tree-chevron" aria-hidden>
                      {isOpen ? '▼' : '▶'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tree-folder-label"
                    onClick={() => toggleFolderExpand(node.path)}
                    aria-label={expandLabel}
                  >
                    {isHome ? (
                      <span className="tree-home-icon" aria-hidden>
                        🏠
                      </span>
                    ) : (
                      <>
                        <span className="tree-folder-icon" aria-hidden>
                          📁
                        </span>
                        <span className="tree-folder-name">{node.name}</span>
                      </>
                    )}
                  </button>
                  <span className="tree-folder-size">{formatBytes(node.sizeBytes)}</span>
                </div>
              </div>
            );
          }

          const item = node.item!;
          return (
            <div
              key={rowKey(node)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-file-row"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <label
                className="file-row tree-file-row"
                style={{ paddingLeft: `${indent}px` }}
                title={item.path}
              >
                <input
                  type="checkbox"
                  checked={rowSelected(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <div className="file-meta">
                  <span className="file-path">{node.name}</span>
                  <span className="muted">{item.categoryLabel}</span>
                </div>
                <RiskBadge risk={item.risk} />
                <span className="file-size">{formatBytes(item.sizeBytes)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VirtualScanFileFlatList({
  items,
  onToggle,
  isSelected,
}: Pick<Props, 'items' | 'onToggle' | 'isSelected'>) {
  const rowSelected = isSelected ?? ((id: string) => items.find((i) => i.id === id)?.selected ?? false);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => FILE_ROW_ESTIMATE_PX,
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  return (
    <div ref={parentRef} className="file-list virtual-file-list">
      <div
        className="virtual-file-list-inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-file-row"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <label className="file-row" title={item.path}>
                <input
                  type="checkbox"
                  checked={rowSelected(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <div className="file-meta">
                  <span className="file-path">{item.path}</span>
                  <span className="muted">{item.categoryLabel}</span>
                </div>
                <RiskBadge risk={item.risk} />
                <span className="file-size">{formatBytes(item.sizeBytes)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function VirtualScanFileList({ view, ...props }: Props) {
  if (!props.items.length) {
    return null;
  }

  if (view === 'flat') {
    return <VirtualScanFileFlatList {...props} />;
  }

  return <VirtualScanFileTreeList {...props} />;
}
