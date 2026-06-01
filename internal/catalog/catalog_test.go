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
	if len(c.Categories) < 45 {
		t.Fatalf("expected at least 45 categories, got %d", len(c.Categories))
	}
}

func TestCategoryIDsByTags(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}
	ids := c.CategoryIDsByTags([]string{"developer"})
	if len(ids) < 5 {
		t.Fatalf("expected several developer categories, got %v", ids)
	}
	found := false
	for _, id := range ids {
		if id == "xcode_derived" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("xcode_derived not in developer tags: %v", ids)
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

func TestMatchCategoryGradleCache(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	gradleRoot := filepath.Join(dir, ".gradle", "caches")
	if err := os.MkdirAll(gradleRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	cacheFile := filepath.Join(gradleRoot, "modules-2", "files-2.1", "artifact.jar")
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheFile, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	testCat := catalog.Category{
		ID:    "gradle_cache",
		Label: "Gradle Cache",
		Risk:  "safe",
		Paths: []string{gradleRoot},
		Rules: []catalog.Rule{{Glob: "**/*", MinAgeDays: 0}},
	}
	c.Categories = append(c.Categories, testCat)

	info, err := os.Stat(cacheFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(cacheFile, info)
	if !ok || matched.ID != "gradle_cache" {
		t.Fatalf("expected gradle cache match, got ok=%v cat=%v", ok, matched)
	}
}

func TestMatchCategoryAndroidStudioGlob(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	googleCache := filepath.Join(dir, "Library", "Caches", "Google")
	studioDir := filepath.Join(googleCache, "AndroidStudio2024.3")
	if err := os.MkdirAll(studioDir, 0o755); err != nil {
		t.Fatal(err)
	}
	cacheFile := filepath.Join(studioDir, "caches", "index.dat")
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheFile, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = os.Chtimes(cacheFile, time.Now().Add(-8*24*time.Hour), time.Now().Add(-8*24*time.Hour))

	testCat := catalog.Category{
		ID:    "android_studio_cache",
		Label: "Android Studio Cache",
		Risk:  "safe",
		Paths: []string{googleCache},
		Rules: []catalog.Rule{{Glob: "AndroidStudio*/**/*", MinAgeDays: 7}},
	}
	c.Categories = []catalog.Category{testCat}

	info, err := os.Stat(cacheFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(cacheFile, info)
	if !ok || matched.ID != "android_studio_cache" {
		t.Fatalf("expected android studio cache match, got ok=%v cat=%v", ok, matched)
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

func TestMatchCategoryMailContainerCache(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	mailRoot := filepath.Join(dir, "com.apple.mail", "Data", "Library", "Caches")
	cacheFile := filepath.Join(mailRoot, "MessageCache", "entry.bin")
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheFile, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	testCat := catalog.Category{
		ID:    "mail_app_cache",
		Label: "Mail App Cache",
		Risk:  "safe",
		Paths: []string{filepath.Join(dir, "com.apple.mail", "Data", "Library", "Caches")},
		Rules: []catalog.Rule{{Glob: "**/*", MinAgeDays: 0}},
	}
	c.Categories = []catalog.Category{testCat}

	info, err := os.Stat(cacheFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(cacheFile, info)
	if !ok || matched.ID != "mail_app_cache" {
		t.Fatalf("expected mail cache match, got ok=%v cat=%v", ok, matched)
	}
}

func TestMatchCategoryPhotosCache(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	cacheFile := filepath.Join(dir, "com.apple.Photos", "thumb.db")
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheFile, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	testCat := catalog.Category{
		ID:    "photos_analysis_cache",
		Label: "Photos Analysis Cache",
		Risk:  "safe",
		Paths: []string{dir},
		Rules: []catalog.Rule{{Glob: "**/*", MinAgeDays: 0}},
	}
	c.Categories = []catalog.Category{testCat}

	info, err := os.Stat(cacheFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(cacheFile, info)
	if !ok || matched.ID != "photos_analysis_cache" {
		t.Fatalf("expected photos cache match, got ok=%v cat=%v", ok, matched)
	}
}

func TestMatchCategoryChromeGPUCache(t *testing.T) {
	c, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	chromeRoot := filepath.Join(dir, "Chrome")
	cacheFile := filepath.Join(chromeRoot, "Default", "GPUCache", "data_0")
	if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cacheFile, []byte("cache"), 0o644); err != nil {
		t.Fatal(err)
	}

	testCat := catalog.Category{
		ID:    "chrome_cache",
		Label: "Chrome Cache",
		Risk:  "safe",
		Paths: []string{chromeRoot},
		Rules: []catalog.Rule{{Glob: "**/GPUCache/**", MinAgeDays: 0}},
	}
	c.Categories = []catalog.Category{testCat}

	info, err := os.Stat(cacheFile)
	if err != nil {
		t.Fatal(err)
	}
	matched, ok := c.MatchCategory(cacheFile, info)
	if !ok || matched.ID != "chrome_cache" {
		t.Fatalf("expected GPUCache match, got ok=%v cat=%v", ok, matched)
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
