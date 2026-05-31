package delete

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"mac-cleaner/internal/model"
)

type ProgressFunc func(model.ScanProgress)

type auditRecord struct {
	path     string
	category string
	success  bool
	err      error
}

type Service struct {
	auditLog *slog.Logger
	auditCh  chan auditRecord
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
	s := &Service{
		auditLog: slog.New(handler),
		auditCh:  make(chan auditRecord, 4096),
	}
	go s.auditWorker()
	return s
}

func (s *Service) auditWorker() {
	for rec := range s.auditCh {
		attrs := []any{
			"path", rec.path,
			"category", rec.category,
			"success", rec.success,
			"timestamp", time.Now().UTC().Format(time.RFC3339),
		}
		if rec.err != nil {
			attrs = append(attrs, "error", rec.err.Error())
		}
		s.auditLog.Info("delete", attrs...)
	}
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
	rec := auditRecord{path: path, category: category, success: success, err: err}
	select {
	case s.auditCh <- rec:
	default:
		s.auditLog.Info("delete", "path", path, "category", category, "success", success, "dropped", true)
	}
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
			report.Failures = append(report.Failures, model.CleanupFailure{
				Path:  r.Path,
				Error: r.Error,
			})
		}
	}
	return report
}

func MoveToTrash(path string) error {
	_, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return moveToTrashOS(path)
}

func RevealInFinder(path string) error {
	if _, err := os.Lstat(path); err != nil {
		return err
	}
	return exec.Command("open", "-R", path).Run()
}

func OpenAuditLog() error {
	path := auditLogPath()
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			f, createErr := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
			if createErr != nil {
				return createErr
			}
			_ = f.Close()
		} else {
			return err
		}
	}
	return exec.Command("open", path).Run()
}

func ParseAuditEntries(maxLines int) ([]model.AuditLogEntry, error) {
	raw, err := ReadAuditTail(maxLines)
	if err != nil {
		return nil, err
	}
	out := make([]model.AuditLogEntry, 0, len(raw))
	for _, entry := range raw {
		out = append(out, mapToAuditEntry(entry))
	}
	return out, nil
}

func mapToAuditEntry(m map[string]any) model.AuditLogEntry {
	e := model.AuditLogEntry{}
	if v, ok := m["path"].(string); ok {
		e.Path = v
	}
	if v, ok := m["category"].(string); ok {
		e.Category = v
	}
	if v, ok := m["success"].(bool); ok {
		e.Success = v
	}
	if v, ok := m["error"].(string); ok {
		e.Error = v
	}
	if v, ok := m["timestamp"].(string); ok {
		e.Timestamp = v
	}
	return e
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
