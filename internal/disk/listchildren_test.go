package disk_test

import (
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/disk"
)

func TestListChildren(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a.txt"), make([]byte, 100), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sub", "b.txt"), make([]byte, 200), 0o644); err != nil {
		t.Fatal(err)
	}

	children, err := disk.ListChildren(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(children) != 2 {
		t.Fatalf("got %d children, want 2", len(children))
	}
}

func TestListChildren_notDir(t *testing.T) {
	root := t.TempDir()
	f := filepath.Join(root, "file.txt")
	if err := os.WriteFile(f, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := disk.ListChildren(f)
	if err == nil {
		t.Fatal("expected error for file path")
	}
}

func TestListChildren_missing(t *testing.T) {
	_, err := disk.ListChildren(filepath.Join(t.TempDir(), "nope"))
	if !os.IsNotExist(err) {
		t.Fatalf("got %v, want not exist", err)
	}
}
