package disk

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/model"
)

func TestPrunePath(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "a"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a", "big.txt"), make([]byte, 500), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "keep.txt"), make([]byte, 100), 0o644); err != nil {
		t.Fatal(err)
	}

	tree, err := BuildTree(context.Background(), root, Options{MaxDepth: 4}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if tree.SizeBytes != 600 {
		t.Fatalf("before prune: %d", tree.SizeBytes)
	}

	pruned := PrunePath(tree, filepath.Join(root, "a"))
	if pruned.SizeBytes != 100 {
		t.Fatalf("after prune: %d, want 100", pruned.SizeBytes)
	}
	if findChild(pruned, "a") != nil {
		t.Fatal("expected folder a removed")
	}
}

func TestPrunePathPreservesDeepRollup(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "a", "b", "c", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a", "visible.txt"), make([]byte, 50), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a", "b", "c", "deep", "hidden.txt"), make([]byte, 400), 0o644); err != nil {
		t.Fatal(err)
	}

	tree, err := BuildTree(context.Background(), root, Options{MaxDepth: 2}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if tree.SizeBytes != 450 {
		t.Fatalf("before prune root = %d, want 450", tree.SizeBytes)
	}
	aBefore := findChild(tree, "a")
	if aBefore == nil {
		t.Fatal("missing folder a")
	}

	PrunePath(tree, filepath.Join(root, "a", "visible.txt"))
	if tree.SizeBytes != 400 {
		t.Fatalf("after prune root = %d, want 400", tree.SizeBytes)
	}
	aAfter := findChild(tree, "a")
	if aAfter == nil {
		t.Fatal("folder a should remain")
	}
	if aAfter.SizeBytes != 400 {
		t.Fatalf("after prune folder a = %d, want 400 (rollup kept)", aAfter.SizeBytes)
	}
}

func findChild(node *model.DirNode, name string) *model.DirNode {
	for _, c := range node.Children {
		if c.Name == name {
			return c
		}
	}
	return nil
}
