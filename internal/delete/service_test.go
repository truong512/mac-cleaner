package delete_test

import (
	"context"
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
	if err == nil {
		t.Fatal("expected error for missing file")
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
