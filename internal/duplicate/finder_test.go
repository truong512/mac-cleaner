package duplicate_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/duplicate"
	"mac-cleaner/internal/model"
)

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
