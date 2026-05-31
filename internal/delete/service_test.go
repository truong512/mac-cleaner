package delete_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/delete"
	"mac-cleaner/internal/model"
)

func TestPreview(t *testing.T) {
	svc := delete.NewService()
	items := []model.ScanItem{
		{Path: "/tmp/a", Selected: true, SizeBytes: 100, Category: "test", CategoryLbl: "Test", Risk: model.RiskSafe},
		{Path: "/tmp/b", Selected: false, SizeBytes: 200, Category: "test", CategoryLbl: "Test", Risk: model.RiskSafe},
	}
	report := svc.Preview(items)
	if !report.DryRun {
		t.Fatal("expected dry run")
	}
	if report.TotalBytes != 100 {
		t.Fatalf("expected 100 bytes, got %d", report.TotalBytes)
	}
}

func TestMoveToTrashMissing(t *testing.T) {
	err := delete.MoveToTrash(filepath.Join(t.TempDir(), "missing"))
	if err != nil {
		t.Fatalf("missing path should be treated as already removed: %v", err)
	}
}

func TestMoveToTrashBrokenSymlink(t *testing.T) {
	dir := t.TempDir()
	link := filepath.Join(dir, "broken-link")
	if err := os.Symlink(filepath.Join(dir, "nonexistent-target"), link); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(link); err == nil {
		t.Fatal("expected stat through broken symlink to fail")
	}
	if _, err := os.Lstat(link); err != nil {
		t.Fatalf("lstat on broken symlink: %v", err)
	}
	// Trash may require Finder integration; ensure we at least pass the existence check.
	if err := delete.MoveToTrash(link); err != nil {
		t.Fatalf("broken symlink should be trashable: %v", err)
	}
}

func TestDeleteProgress(t *testing.T) {
	svc := delete.NewService()
	var phases []string
	progress := func(p model.ScanProgress) {
		phases = append(phases, p.Phase)
	}

	results := svc.DeletePaths(context.Background(), nil, "test", progress)
	if len(results) != 0 {
		t.Fatalf("expected no results, got %d", len(results))
	}
	if len(phases) != 1 || phases[0] != "done" {
		t.Fatalf("expected done phase for empty delete, got %v", phases)
	}
}
