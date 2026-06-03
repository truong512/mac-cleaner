package bigfiles

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestScanFindsArchivesAndBigFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "small.zip"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	bigPath := filepath.Join(dir, "large.bin")
	if err := os.WriteFile(bigPath, make([]byte, 1024*1024), 0o644); err != nil {
		t.Fatal(err)
	}

	items, err := Scan(context.Background(), Options{
		Roots:           []string{dir},
		MinSizeBytes:    512 * 1024,
		IncludeBigFiles: true,
		IncludeArchives: true,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	var archives, big int
	for _, item := range items {
		switch item.Category {
		case "archives":
			archives++
		case "big_files":
			big++
		}
	}
	if archives != 1 {
		t.Fatalf("expected 1 archive, got %d", archives)
	}
	if big != 1 {
		t.Fatalf("expected 1 big file, got %d", big)
	}
}

func TestDefaultRootsIsHome(t *testing.T) {
	roots, err := DefaultRoots()
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

func TestScanRespectsIncludeFlags(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "data.zip"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "big.dat"), make([]byte, 1024*1024), 0o644); err != nil {
		t.Fatal(err)
	}

	archivesOnly, err := Scan(context.Background(), Options{
		Roots:           []string{dir},
		MinSizeBytes:    512 * 1024,
		IncludeBigFiles: false,
		IncludeArchives: true,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(archivesOnly) != 1 || archivesOnly[0].Category != "archives" {
		t.Fatalf("expected single archive item, got %+v", archivesOnly)
	}
}
