package delete

import (
	"testing"

	"mac-cleaner/internal/model"
)

func TestMapToAuditEntry(t *testing.T) {
	e := mapToAuditEntry(map[string]any{
		"path":      "/tmp/x",
		"category":  "cleanup",
		"success":   false,
		"error":     "permission denied",
		"timestamp": "2026-01-01T00:00:00Z",
	})
	if e.Path != "/tmp/x" || e.Error != "permission denied" || e.Success {
		t.Fatalf("unexpected entry: %+v", e)
	}
}

func TestBuildReportIncludesFailures(t *testing.T) {
	svc := NewService()
	report := svc.buildReport(nil, false, []model.DeleteResult{
		{Path: "/a", Success: false, Error: "file not found"},
	})
	if report.Failed != 1 || len(report.Failures) != 1 || report.Failures[0].Error != "file not found" {
		t.Fatalf("expected failure details, got %+v", report)
	}
}
