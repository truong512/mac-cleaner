package catalog_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"mac-cleaner/internal/catalog"
)

func TestLoadCatalog(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Categories) < 10 {
		t.Fatalf("expected at least 10 categories, got %d", len(c.Categories))
	}
}

func TestMatchCategory(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	cacheRoot := filepath.Join(dir, "Library", "Caches")
	if err := os.MkdirAll(cacheRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	oldFile := filepath.Join(cacheRoot, "com.example.app", "cache.db")
	if err := os.MkdirAll(filepath.Dir(oldFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldFile, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = os.Chtimes(oldFile, time.Now().Add(-48*time.Hour), time.Now().Add(-48*time.Hour))

	// Override catalog paths for test by using temp dir structure
	testCat := catalog.Category{
		ID:    "test_cache",
		Label: "Test Cache",
		Risk:  "safe",
		Paths: []string{cacheRoot},
		Rules: []catalog.Rule{{Glob: "**/*", MinAgeDays: 1}},
	}
	c.Categories = []catalog.Category{testCat}

	info, err := os.Stat(oldFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(oldFile, info)
	if !ok || matched.ID != "test_cache" {
		t.Fatalf("expected match for cache file, got ok=%v cat=%v", ok, matched)
	}
}

func TestIsProtected(t *testing.T) {
	if !catalog.IsProtected("/System/Library") {
		t.Fatal("expected /System to be protected")
	}
	if catalog.IsProtected("/tmp/test") {
		t.Fatal("did not expect /tmp to be protected")
	}
}

func TestExpandPath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}

	got, err := catalog.ExpandPath("~")
	if err != nil {
		t.Fatal(err)
	}
	if got != home {
		t.Fatalf("ExpandPath(~) = %q, want %q", got, home)
	}

	got, err = catalog.ExpandPath("~/Documents")
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(home, "Documents") {
		t.Fatalf("ExpandPath(~/Documents) = %q, want %q", got, filepath.Join(home, "Documents"))
	}
}
