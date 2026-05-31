import type { DirNode } from '../types';

export function findDirNode(tree: DirNode, path: string): DirNode | null {
  if (tree.path === path) {
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
