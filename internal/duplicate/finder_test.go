package duplicate_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/duplicate"
	"mac-cleaner/internal/model"
)

func TestDefaultRootsIsHome(t *testing.T) {
	roots, err := duplicate.DefaultRoots()
	if err != nil {
		t.Fatal(err)
	}
	if len(roots) != 1 {
		t.Fatalf("expected 1 root, got %v", roots)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	if roots[0] != home {
		t.Fatalf("DefaultRoots() = %q, want home %q", roots[0], home)
	}
}

func TestScanDuplicates(t *testing.T) {
	dir := t.TempDir()
	content := []byte("duplicate content for test")
	f1 := filepath.Join(dir, "a.txt")
	f2 := filepath.Join(dir, "b.txt")
	f3 := filepath.Join(dir, "unique.txt")
	for _, p := range []string{f1, f2} {
		if err := os.WriteFile(p, content, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(f3, []byte("unique"), 0o644); err != nil {
		t.Fatal(err)
	}

	groups, err := duplicate.Scan(context.Background(), []string{dir}, duplicate.Options{MinSizeBytes: 1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 duplicate group, got %d", len(groups))
	}
	if len(groups[0].Paths) != 2 {
		t.Fatalf("expected 2 paths in group, got %d", len(groups[0].Paths))
	}
}

func TestGroupsSortedBySizeDescending(t *testing.T) {
	dir := t.TempDir()
	small := []byte("small dup")
	large := make([]byte, 64*1024)
	for i := range large {
		large[i] = byte(i % 256)
	}
	writeDup := func(name string, data []byte) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name+"-1"), data, 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name+"-2"), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeDup("small", small)
	writeDup("large", large)

	groups, err := duplicate.Scan(context.Background(), []string{dir}, duplicate.Options{MinSizeBytes: 1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 duplicate groups, got %d", len(groups))
	}
	if groups[0].SizeBytes < groups[1].SizeBytes {
		t.Fatalf("groups not sorted by size descending: %d then %d", groups[0].SizeBytes, groups[1].SizeBytes)
	}
}

func TestPathsToDelete(t *testing.T) {
	g := model.DuplicateGroup{
		Paths:  []string{"/a", "/b", "/c"},
		Keeper: "/b",
	}
	del := duplicate.PathsToDelete(g)
	if len(del) != 2 {
		t.Fatalf("expected 2 deletes, got %v", del)
	}
}
