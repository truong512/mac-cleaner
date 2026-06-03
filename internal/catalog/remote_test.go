package catalog_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"mac-cleaner/internal/catalog"
)

const minimalCatalog = `categories:
  - id: test_cat
    label: Test
    risk: safe
    description: test
    paths:
      - "~/tmp"
    rules:
      - glob: "**/*"
`

func TestDownloadFromURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(minimalCatalog))
	}))
	defer srv.Close()

	dir := t.TempDir()
	t.Setenv("HOME", dir)

	cat, err := catalog.DownloadFromURL(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(cat.Categories) != 1 || cat.Categories[0].ID != "test_cat" {
		t.Fatalf("unexpected catalog: %+v", cat.Categories)
	}
	info, err := catalog.GetInfo(cat)
	if err != nil {
		t.Fatal(err)
	}
	if info.Source != catalog.SourceCustom {
		t.Fatalf("source = %q, want custom", info.Source)
	}
	if info.Path == "" {
		t.Fatal("expected custom path")
	}
}

func TestParseRejectsEmpty(t *testing.T) {
	_, err := catalog.Parse([]byte("categories: []\n"))
	if err == nil {
		t.Fatal("expected error for empty categories")
	}
}

func TestRemoveUserCatalog(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(minimalCatalog))
	}))
	defer srv.Close()
	_, err := catalog.DownloadFromURL(context.Background(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if err := catalog.RemoveUserCatalog(); err != nil {
		t.Fatal(err)
	}
	cat, err := catalog.Load()
	if err != nil {
		t.Fatal(err)
	}
	info, err := catalog.GetInfo(cat)
	if err != nil {
		t.Fatal(err)
	}
	if info.Source != catalog.SourceEmbedded {
		t.Fatalf("source = %q, want embedded", info.Source)
	}
}
