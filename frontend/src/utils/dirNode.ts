import type { DirNode } from '../types';
import { model } from '../types';
import { basename } from './format';

export type DiskNavHints = {
  name?: string;
  sizeBytes?: number;
};

export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }
  return path.replace(/\/+$/, '') || '/';
}

export function parentDirPath(path: string): string {
  const trimmed = normalizePath(path);
  if (trimmed === '/') {
    return '/';
  }
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) {
    return '/';
  }
  return trimmed.slice(0, idx) || '/';
}

export function findDirNode(tree: DirNode, path: string): DirNode | null {
  const target = normalizePath(path);
  if (normalizePath(tree.path) === target) {
    return tree;
  }
  for (const child of tree.children || []) {
    const found = findDirNode(child, path);
    if (found) {
      return found;
    }
  }
  return null;
}

function withExpandedChildren(node: DirNode, expanded: Map<string, DirNode[]>): DirNode {
  const extra = expanded.get(normalizePath(node.path));
  if (!extra?.length) {
    return node;
  }
  return model.DirNode.createFrom({ ...node, children: extra });
}

/** Resolve the folder to show when navigating Space Map (scan tree + lazy-expanded paths). */
export function resolveDiskNavNode(
  tree: DirNode,
  path: string,
  expanded: Map<string, DirNode[]>,
  hints?: Map<string, DiskNavHints>
): DirNode {
  const target = normalizePath(path);
  const rootPath = normalizePath(tree.path);

  if (target === rootPath) {
    return withExpandedChildren(tree, expanded);
  }

  const inTree = findDirNode(tree, target);
  if (inTree) {
    return withExpandedChildren(inTree, expanded);
  }

  const lazyChildren = expanded.get(target);
  if (lazyChildren) {
    const meta = hints?.get(target);
    return model.DirNode.createFrom({
      name: meta?.name ?? basename(target),
      path: target,
      isDir: true,
      sizeBytes: meta?.sizeBytes ?? 0,
      children: lazyChildren,
    });
  }

  // Nearest ancestor present in the scan tree (e.g. going up from a lazy-only path).
  let p = target;
  while (p && p !== '/') {
    const ancestor = findDirNode(tree, p);
    if (ancestor) {
      return withExpandedChildren(ancestor, expanded);
    }
    const parent = parentDirPath(p);
    if (parent === p) {
      break;
    }
    p = parent;
  }

  return tree;
}

/** Detach a path and subtract its size from ancestors (preserves deep-scan rollup on parents). */
export function prunePathFromTree(root: DirNode, targetPath: string): DirNode {
  const target = normalizePath(targetPath);
  const rootPath = normalizePath(root.path);

  if (rootPath === target) {
    return model.DirNode.createFrom({ ...root, children: [], sizeBytes: 0 });
  }

  const node = findDirNode(root, target);
  if (!node) {
    return root;
  }

  const removedBytes = node.sizeBytes;
  const parentPath = parentDirPath(target);
  const parent = findDirNode(root, parentPath);
  if (parent?.children) {
    parent.children = parent.children.filter((c) => normalizePath(c.path) !== target);
  }
  subtractBytesFromAncestors(root, target, removedBytes);
  return root;
}

/** Subtract bytes from each indexed ancestor (matches backend PrunePath). */
export function subtractBytesFromAncestors(
  root: DirNode,
  deletedPath: string,
  delta: number
): void {
  if (delta <= 0) {
    return;
  }
  let p = parentDirPath(deletedPath);
  const rootPath = normalizePath(root.path);
  for (;;) {
    const ancestor = findDirNode(root, p);
    if (ancestor?.isDir) {
      ancestor.sizeBytes = Math.max(0, ancestor.sizeBytes - delta);
    }
    if (normalizePath(p) === rootPath) {
      break;
    }
    const next = parentDirPath(p);
    if (next === p) {
      break;
    }
    p = next;
  }
}

/** Largest files under a node (uses the current in-memory subtree). */
export function collectTopFiles(node: DirNode, limit: number): DirNode[] {
  const files: DirNode[] = [];
  function walk(n: DirNode) {
    if (!n.isDir) {
      files.push(n);
      return;
    }
    for (const c of n.children || []) {
      walk(c);
    }
  }
  walk(node);
  files.sort((a, b) => b.sizeBytes - a.sizeBytes);
  if (limit > 0 && files.length > limit) {
    return files.slice(0, limit);
  }
  return files;
}

export function pruneExpandedMaps(
  expanded: Map<string, DirNode[]>,
  hints: Map<string, DiskNavHints>,
  deletedPath: string
): void {
  const target = normalizePath(deletedPath);
  for (const key of [...expanded.keys()]) {
    const k = normalizePath(key);
    if (k === target || k.startsWith(`${target}/`)) {
      expanded.delete(key);
      hints.delete(key);
    }
  }
  for (const [key, children] of expanded) {
    const filtered = children.filter((c) => {
      const p = normalizePath(c.path);
      return p !== target && !p.startsWith(`${target}/`);
    });
    if (filtered.length !== children.length) {
      expanded.set(key, filtered);
    }
  }
}
