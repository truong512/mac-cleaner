import type { ScanItem } from '../types';
import { normalizePath } from './dirNode';

export type ScanTreeNode = {
  path: string;
  name: string;
  kind: 'folder' | 'file' | 'home';
  item?: ScanItem;
  children: ScanTreeNode[];
  sizeBytes: number;
};

export type ScanTreeFlatRow = {
  node: ScanTreeNode;
  depth: number;
};

type BuilderNode = {
  folders: Map<string, BuilderNode>;
  files: ScanItem[];
  /** Absolute path for this folder (set when the node is created during insert). */
  fullPath?: string;
};

function newBuilder(): BuilderNode {
  return { folders: new Map(), files: [] };
}

function joinPathSegments(base: string, name: string): string {
  const normalized = normalizePath(base);
  if (normalized === '/') {
    return `/${name}`;
  }
  return `${normalized}/${name}`;
}

/** Path segments under home (home itself and /Users/… ancestors are omitted). */
function relativePartsForTree(itemPath: string, homeDir?: string): string[] {
  const parts = normalizePath(itemPath).split('/').filter(Boolean);
  if (!homeDir) {
    return parts;
  }
  const home = normalizePath(homeDir);
  if (!isUnderHome(itemPath, homeDir)) {
    return parts;
  }
  const homeParts = home.split('/').filter(Boolean);
  return parts.slice(homeParts.length);
}

function isUnderHome(itemPath: string, homeDir: string): boolean {
  const home = normalizePath(homeDir);
  const fullPath = normalizePath(itemPath);
  return fullPath === home || fullPath.startsWith(`${home}/`);
}

function insertItem(root: BuilderNode, item: ScanItem, homeDir?: string) {
  const parts = relativePartsForTree(item.path, homeDir);
  if (!parts.length) {
    root.files.push(item);
    return;
  }
  const home = homeDir ? normalizePath(homeDir) : '';
  const underHome = !!home && isUnderHome(item.path, home);
  let node = root;
  let folderPath = underHome ? home : '/';

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    folderPath = joinPathSegments(folderPath, part);
    let next = node.folders.get(part);
    if (!next) {
      next = newBuilder();
      next.fullPath = folderPath;
      node.folders.set(part, next);
    }
    node = next;
    folderPath = next.fullPath!;
  }
  node.files.push(item);
}

function compareNodes(a: ScanTreeNode, b: ScanTreeNode): number {
  if (a.kind !== b.kind) {
    if (a.kind === 'folder' || a.kind === 'home') {
      return -1;
    }
    if (b.kind === 'folder' || b.kind === 'home') {
      return 1;
    }
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function totalSize(nodes: ScanTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + n.sizeBytes, 0);
}

function builderToNodes(builder: BuilderNode): ScanTreeNode[] {
  const nodes: ScanTreeNode[] = [];

  const folderNames = [...builder.folders.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
  for (const name of folderNames) {
    const child = builder.folders.get(name)!;
    const fullPath = child.fullPath ?? `/${name}`;
    const children = builderToNodes(child);
    const sizeBytes = children.reduce((sum, c) => sum + c.sizeBytes, 0);
    nodes.push({
      path: fullPath,
      name,
      kind: 'folder',
      children,
      sizeBytes,
    });
  }

  const files = [...builder.files].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  );
  for (const item of files) {
    const name = item.path.split('/').filter(Boolean).pop() || item.path;
    nodes.push({
      path: item.path,
      name,
      kind: 'file',
      item,
      children: [],
      sizeBytes: item.sizeBytes,
    });
  }

  return nodes.sort(compareNodes);
}

/** Best-effort home path from scan items (e.g. /Users/John). */
export function inferHomeDirFromItems(items: ScanItem[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    const match = normalizePath(item.path).match(/^(\/Users\/[^/]+)/);
    if (match) {
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [home, count] of counts) {
    if (count > bestCount) {
      best = home;
      bestCount = count;
    }
  }
  return best;
}

export function buildScanItemTree(items: ScanItem[], homeDir?: string): ScanTreeNode[] {
  const home = homeDir ? normalizePath(homeDir) : '';
  const homeBuilder = newBuilder();
  const outsideBuilder = newBuilder();

  for (const item of items) {
    if (home && isUnderHome(item.path, home)) {
      insertItem(homeBuilder, item, home);
    } else {
      insertItem(outsideBuilder, item, undefined);
    }
  }

  const nodes: ScanTreeNode[] = [];
  const homeChildren = builderToNodes(homeBuilder);
  if (home && homeChildren.length > 0) {
    nodes.push({
      path: home,
      name: '',
      kind: 'home',
      children: homeChildren,
      sizeBytes: totalSize(homeChildren),
    });
  }

  nodes.push(...builderToNodes(outsideBuilder));
  return nodes;
}

export function collectFolderPaths(nodes: ScanTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.kind === 'home') {
      paths.push(node.path);
      paths.push(...collectFolderPaths(node.children));
    }
  }
  return paths;
}

export function collectFileIdsInTree(node: ScanTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: ScanTreeNode) {
    if (n.kind === 'file' && n.item) {
      ids.push(n.item.id);
    }
    for (const child of n.children) {
      walk(child);
    }
  }
  walk(node);
  return ids;
}

export function folderCheckState(
  node: ScanTreeNode,
  isSelected: (id: string) => boolean
): { checked: boolean; indeterminate: boolean; selectedCount: number; totalCount: number } {
  const ids = collectFileIdsInTree(node);
  if (!ids.length) {
    return { checked: false, indeterminate: false, selectedCount: 0, totalCount: 0 };
  }
  let selectedCount = 0;
  for (const id of ids) {
    if (isSelected(id)) {
      selectedCount++;
    }
  }
  const allSelected = selectedCount === ids.length;
  return {
    checked: allSelected,
    indeterminate: selectedCount > 0 && !allSelected,
    selectedCount,
    totalCount: ids.length,
  };
}

export function flattenScanTree(
  nodes: ScanTreeNode[],
  expanded: Set<string>,
  depth = 0
): ScanTreeFlatRow[] {
  const rows: ScanTreeFlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if ((node.kind === 'folder' || node.kind === 'home') && expanded.has(node.path)) {
      rows.push(...flattenScanTree(node.children, expanded, depth + 1));
    }
  }
  return rows;
}
