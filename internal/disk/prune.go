package disk

import (
	"path/filepath"
	"strings"

	"mac-cleaner/internal/model"
)

// PrunePath removes targetPath from the tree and subtracts its SizeBytes from ancestors.
// Directory sizes include deep-scan rollup beyond max depth; recomputing from children only would drop that.
func PrunePath(root *model.DirNode, targetPath string) *model.DirNode {
	if root == nil {
		return nil
	}
	target := cleanPath(targetPath)
	if target == "" {
		return root
	}

	if cleanPath(root.Path) == target {
		root.Children = nil
		root.SizeBytes = 0
		return root
	}

	node := FindNode(root, target)
	if node == nil {
		return root
	}

	removedBytes := node.SizeBytes
	if !detachChild(root, target) {
		return root
	}
	subtractFromAncestors(root, target, removedBytes)
	return root
}

func cleanPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	return filepath.Clean(p)
}

func detachChild(root *model.DirNode, target string) bool {
	parentPath := filepath.Dir(target)
	if cleanPath(parentPath) == target {
		return false
	}
	parent := FindNode(root, parentPath)
	if parent == nil {
		return false
	}
	kept := parent.Children[:0]
	for _, child := range parent.Children {
		if child == nil {
			continue
		}
		if cleanPath(child.Path) == target {
			continue
		}
		kept = append(kept, child)
	}
	parent.Children = kept
	return true
}

func subtractFromAncestors(root *model.DirNode, target string, delta int64) {
	if delta <= 0 {
		return
	}
	p := filepath.Dir(target)
	rootPath := cleanPath(root.Path)
	for {
		if node := FindNode(root, p); node != nil && node.IsDir {
			node.SizeBytes -= delta
			if node.SizeBytes < 0 {
				node.SizeBytes = 0
			}
		}
		if cleanPath(p) == rootPath {
			break
		}
		next := filepath.Dir(p)
		if next == p {
			break
		}
		p = next
	}
}
