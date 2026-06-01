package insights

import (
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/catalog"
)

func TestMeasurePathWalk(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.bin"), []byte("12345"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := measurePath(dir)
	if !r.Readable || r.Bytes != 5 {
		t.Fatalf("got %+v, want 5 bytes readable", r)
	}
}

func TestMeasurePathMissing(t *testing.T) {
	r := measurePath(filepath.Join(t.TempDir(), "nope"))
	if r.Exists || r.Readable {
		t.Fatalf("got %+v", r)
	}
}

func TestTaggedCacheInsight(t *testing.T) {
	dir := t.TempDir()
	cacheRoot := filepath.Join(dir, "Library", "Caches", "com.apple.mail")
	if err := os.MkdirAll(cacheRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cacheRoot, "x.cache"), []byte("cache-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	cat := &catalog.Catalog{
		Categories: []catalog.Category{
			{
				ID:    "mail_app_cache",
				Label: "Mail App Cache",
				Tags:  []string{"mail"},
				Paths: []string{cacheRoot},
				Rules: []catalog.Rule{{Glob: "**/*"}},
			},
		},
	}

	ins := taggedCacheInsight(cat, dir, []string{"mail"}, insightMeta{
		ID:    "mail_caches",
		Label: "Mail Caches",
	})
	if !ins.Available {
		t.Fatal("expected available")
	}
	if ins.SizeBytes < 9 {
		t.Fatalf("size = %d", ins.SizeBytes)
	}
}

func TestGetStorageInsightsCount(t *testing.T) {
	cat, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}
	ins := GetStorageInsights(cat)
	if len(ins) != 4 {
		t.Fatalf("expected 4 insights, got %d", len(ins))
	}
}
