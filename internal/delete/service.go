package delete

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"mac-cleaner/internal/model"
)

type ProgressFunc func(model.ScanProgress)

type Service struct {
	mu       sync.Mutex
	auditLog *slog.Logger
}

func NewService() *Service {
	logPath := auditLogPath()
	_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	var handler slog.Handler
	if err != nil {
		handler = slog.NewTextHandler(os.Stderr, nil)
	} else {
		handler = slog.NewJSONHandler(f, &slog.HandlerOptions{AddSource: false})
	}
	return &Service{auditLog: slog.New(handler)}
}

func auditLogPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Logs", "mac-cleaner", "audit.log")
}

func (s *Service) AuditLogPath() string {
	return auditLogPath()
}

func (s *Service) Preview(items []model.ScanItem) model.CleanupReport {
	return s.buildReport(items, true, nil)
}

func (s *Service) Execute(ctx context.Context, items []model.ScanItem, dryRun bool, onProgress ProgressFunc) model.CleanupReport {
	if dryRun {
		return s.Preview(items)
	}
	selected := make([]model.ScanItem, 0, len(items))
	for _, item := range items {
		if item.Selected {
			selected = append(selected, item)
		}
	}
	results := s.deleteItemsWithProgress(ctx, selected, onProgress)
	return s.buildReport(items, false, results)
}

func emitDeleteStarting(onProgress ProgressFunc, total int) {
	if onProgress == nil || total == 0 {
		return
	}
	onProgress(model.ScanProgress{
		Phase:   "deleting",
		Scanned: 0,
		Total:   int64(total),
		Percent: 0,
		Message: fmt.Sprintf("Moving to Trash (0 of %d)...", total),
	})
}

func emitDeleteProgress(onProgress ProgressFunc, completed, total int, path string) {
	if onProgress == nil || total == 0 {
		return
	}
	percent := float64(completed) / float64(total) * 100
	onProgress(model.ScanProgress{
		Phase:       "deleting",
		CurrentPath: path,
		Scanned:     int64(completed),
		Total:       int64(total),
		Percent:     percent,
		Message:     fmt.Sprintf("Moving to Trash (%d of %d)...", completed, total),
	})
}

func emitDeleteDone(onProgress ProgressFunc, total int) {
	if onProgress == nil {
		return
	}
	onProgress(model.ScanProgress{
		Phase:   "done",
		Scanned: int64(total),
		Total:   int64(total),
		Percent: 100,
		Message: fmt.Sprintf("Finished removing %d item(s)", total),
	})
}

func emitDeleteCancelled(onProgress ProgressFunc, done, total int) {
	if onProgress == nil {
		return
	}
	percent := float64(0)
	if total > 0 {
		percent = float64(done) / float64(total) * 100
	}
	onProgress(model.ScanProgress{
		Phase:   "cancelled",
		Scanned: int64(done),
		Total:   int64(total),
		Percent: percent,
		Message: "Delete cancelled",
	})
}

func (s *Service) deleteOne(path, category string) model.DeleteResult {
	res := model.DeleteResult{Path: path}
	if err := MoveToTrash(path); err != nil {
		res.Success = false
		res.Error = err.Error()
		s.logAudit(path, category, false, err)
		return res
	}
	res.Success = true
	s.logAudit(path, category, true, nil)
	return res
}

func (s *Service) logAudit(path, category string, success bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	attrs := []any{
		"path", path,
		"category", category,
		"success", success,
		"timestamp", time.Now().UTC().Format(time.RFC3339),
	}
	if err != nil {
		attrs = append(attrs, "error", err.Error())
	}
	s.auditLog.Info("delete", attrs...)
}

func (s *Service) buildReport(items []model.ScanItem, dryRun bool, results []model.DeleteResult) model.CleanupReport {
	report := model.CleanupReport{DryRun: dryRun, Items: items}
	catMap := map[string]*model.CategorySummary{}
	for _, item := range items {
		if !item.Selected {
			continue
		}
		report.TotalBytes += item.SizeBytes
		c, ok := catMap[item.Category]
		if !ok {
			c = &model.CategorySummary{
				ID:    item.Category,
				Label: item.CategoryLbl,
				Risk:  item.Risk,
			}
			catMap[item.Category] = c
		}
		c.ItemCount++
		c.SizeBytes += item.SizeBytes
	}
	for _, c := range catMap {
		report.Categories = append(report.Categories, *c)
	}
	for _, r := range results {
		if r.Success {
			report.Deleted++
		} else {
			report.Failed++
			report.FailedPaths = append(report.FailedPaths, r.Path)
		}
	}
	return report
}

func MoveToTrash(path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return moveToTrashOS(path)
}

func RevealInFinder(path string) error {
	if _, err := os.Stat(path); err != nil {
		return err
	}
	return exec.Command("open", "-R", path).Run()
}

func ReadAuditTail(lines int) ([]map[string]any, error) {
	data, err := os.ReadFile(auditLogPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var entries []map[string]any
	for _, line := range splitLines(string(data)) {
		if line == "" {
			continue
		}
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err == nil {
			entries = append(entries, entry)
		}
	}
	if len(entries) > lines {
		entries = entries[len(entries)-lines:]
	}
	return entries, nil
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
