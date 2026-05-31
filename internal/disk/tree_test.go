package disk_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/disk"
)

func TestBuildTreeDepthLimited(t *testing.T) {
	root := t.TempDir()
	mustMkdirAll(t, filepath.Join(root, "a", "b", "c", "deep"))
	mustWriteFile(t, filepath.Join(root, "a", "top.txt"), 100)
	mustWriteFile(t, filepath.Join(root, "a", "b", "mid.txt"), 200)
	mustWriteFile(t, filepath.Join(root, "a", "b", "c", "deep", "hidden.txt"), 400)

	tree, err := disk.BuildTree(context.Background(), root, disk.Options{MaxDepth: 2}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if tree.SizeBytes != 700 {
		t.Fatalf("root size = %d, want 700", tree.SizeBytes)
	}
	if len(tree.Children) != 1 {
		t.Fatalf("expected one top-level child, got %d", len(tree.Children))
	}
	if tree.Children[0].Name != "a" {
		t.Fatalf("expected child a, got %q", tree.Children[0].Name)
	}
}

func TestBuildTreeSkipsNodeModules(t *testing.T) {
	root := t.TempDir()
	mustWriteFile(t, filepath.Join(root, "app.txt"), 50)
	mustMkdirAll(t, filepath.Join(root, "project", "node_modules", "pkg"))
	mustWriteFile(t, filepath.Join(root, "project", "node_modules", "pkg", "index.js"), 5000)
	mustWriteFile(t, filepath.Join(root, "project", "main.go"), 25)

	tree, err := disk.BuildTree(context.Background(), root, disk.Options{MaxDepth: 4}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if tree.SizeBytes != 75 {
		t.Fatalf("root size = %d, want 75 (node_modules skipped)", tree.SizeBytes)
	}
}

func mustMkdirAll(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
}

func mustWriteFile(t *testing.T, path string, size int64) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	data := make([]byte, size)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}
