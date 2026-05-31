package delete_test

import (
	"testing"

	"mac-cleaner/internal/delete"
)

func TestPrunePathsForDelete(t *testing.T) {
	paths := []string{
		"/tmp/cache/app/file1",
		"/tmp/cache/app",
		"/tmp/cache/app/file2",
		"/tmp/other",
	}
	pruned := delete.PrunePathsForDelete(paths)
	if len(pruned) != 2 {
		t.Fatalf("expected 2 paths after prune, got %d: %v", len(pruned), pruned)
	}
	seen := map[string]bool{}
	for _, p := range pruned {
		seen[p] = true
	}
	if !seen["/tmp/cache/app"] || !seen["/tmp/other"] {
		t.Fatalf("unexpected pruned set: %v", pruned)
	}
}

func TestPrunePathsForDeleteDedupes(t *testing.T) {
	paths := []string{"/tmp/a", "/tmp/a", "/tmp/b"}
	pruned := delete.PrunePathsForDelete(paths)
	if len(pruned) != 2 {
		t.Fatalf("expected 2 unique paths, got %d", len(pruned))
	}
}
