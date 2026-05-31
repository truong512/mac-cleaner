package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mac-cleaner/internal/app"
	"mac-cleaner/internal/bigfiles"
	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/delete"
	"mac-cleaner/internal/disk"
	"mac-cleaner/internal/duplicate"
	"mac-cleaner/internal/launchd"
	"mac-cleaner/internal/model"
	"mac-cleaner/internal/permission"
	"mac-cleaner/internal/scan"
)

type Service struct {
	ctx context.Context

	deleteSvc *delete.Service
	scanEng   *scan.Engine
	catalog   *catalog.Catalog

	mu         sync.Mutex
	cancelScan context.CancelFunc
	settings   model.AppSettings

	lastJunkItems    []model.ScanItem
	lastBigFilesItems []model.ScanItem
	lastDupGroups    []model.DuplicateGroup
	lastApps         []model.InstalledApp
	lastDiskTree     *model.DirNode
}

func New() (*Service, error) {
	cat, err := catalog.Load()
	if err != nil {
		return nil, err
	}
	return &Service{
		deleteSvc: delete.NewService(),
		scanEng:   scan.NewEngine(cat),
		catalog:   cat,
		settings: model.AppSettings{
			DryRunDefault:    true,
			ExcludeGlobs:     []string{},
			BigFilesMinBytes: bigfiles.DefaultMinSizeBytes,
		},
	}, nil
}

func (s *Service) Startup(ctx context.Context) {
	s.ctx = ctx
}

func (s *Service) emit(event string, data any) {
	if s.ctx != nil {
		runtime.EventsEmit(s.ctx, event, data)
	}
}

func (s *Service) cancelActiveScan() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelScan != nil {
		s.cancelScan()
		s.cancelScan = nil
	}
}

func (s *Service) withCancel(parent context.Context) (context.Context, context.CancelFunc) {
	s.cancelActiveScan()
	ctx, cancel := context.WithCancel(parent)
	s.mu.Lock()
	s.cancelScan = cancel
	s.mu.Unlock()
	return ctx, cancel
}

func (s *Service) CancelScan() {
	s.cancelActiveScan()
	s.emit("scan:cancelled", map[string]string{"message": "Scan cancelled"})
}

func (s *Service) CancelOperation() {
	s.cancelActiveScan()
	s.emit("scan:cancelled", map[string]string{"message": "Cancelled"})
	s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
}

func (s *Service) deleteCtx() (context.Context, context.CancelFunc) {
	return s.withCancel(s.ctx)
}

func (s *Service) reportFromResults(results []model.DeleteResult) model.CleanupReport {
	report := model.CleanupReport{DryRun: false}
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

func (s *Service) GetDiskSummary() (model.DiskSummary, error) {
	return disk.GetDiskSummary()
}

func (s *Service) GetPermissionStatus() model.PermissionStatus {
	return permission.Status()
}

func (s *Service) OpenFullDiskAccessSettings() error {
	return permission.OpenFullDiskAccessSettings()
}

func (s *Service) GetSettings() model.AppSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings
}

func (s *Service) SaveSettings(settings model.AppSettings) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
}

func (s *Service) GetCatalogCategories() []model.CategorySummary {
	return s.catalog.CategoriesMeta()
}

func (s *Service) ScanJunk() ([]model.ScanItem, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	items, err := s.scanEng.ScanJunk(ctx, onProgress)
	if err != nil && ctx.Err() != nil {
		return items, fmt.Errorf("scan cancelled")
	}

	s.mu.Lock()
	s.lastJunkItems = items
	s.mu.Unlock()

	s.emit("scan:done", map[string]any{
		"count":      len(items),
		"categories": scan.Summarize(items),
	})
	return items, err
}

func (s *Service) GetLastJunkScan() []model.ScanItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastJunkItems
}

func (s *Service) ScanBigFiles(req model.BigFilesScanRequest) ([]model.ScanItem, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	s.mu.Lock()
	minSize := req.MinSizeBytes
	if minSize <= 0 {
		minSize = s.settings.BigFilesMinBytes
	}
	opts := bigfiles.Options{
		Roots:           req.Roots,
		MinSizeBytes:    minSize,
		IncludeBigFiles: req.IncludeBigFiles,
		IncludeArchives: req.IncludeArchives,
		ExcludeGlobs:    s.settings.ExcludeGlobs,
	}
	s.mu.Unlock()

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	items, err := bigfiles.Scan(ctx, opts, onProgress)
	if err != nil && ctx.Err() != nil {
		return items, fmt.Errorf("scan cancelled")
	}

	s.mu.Lock()
	s.lastBigFilesItems = items
	s.mu.Unlock()

	s.emit("scan:done", map[string]any{
		"count":      len(items),
		"totalBytes": bigfiles.TotalBytes(items),
	})
	return items, err
}

func (s *Service) GetLastBigFilesScan() []model.ScanItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastBigFilesItems
}

func (s *Service) GetBigFilesDefaults() model.BigFilesScanRequest {
	s.mu.Lock()
	minSize := s.settings.BigFilesMinBytes
	s.mu.Unlock()
	if minSize <= 0 {
		minSize = bigfiles.DefaultMinSizeBytes
	}
	roots, _ := bigfiles.DefaultRoots()
	return model.BigFilesScanRequest{
		Roots:           roots,
		MinSizeBytes:    minSize,
		IncludeBigFiles: true,
		IncludeArchives: true,
	}
}

func (s *Service) SelectArchivesOnly(items []model.ScanItem) []model.ScanItem {
	out := make([]model.ScanItem, len(items))
	copy(out, items)
	for i := range out {
		out[i].Selected = out[i].Category == "archives"
	}
	return out
}

func (s *Service) SelectBigFilesOnly(items []model.ScanItem) []model.ScanItem {
	out := make([]model.ScanItem, len(items))
	copy(out, items)
	for i := range out {
		out[i].Selected = out[i].Category == "big_files"
	}
	return out
}

func (s *Service) emitDeleteProgress(p model.ScanProgress) {
	s.emit("delete:progress", p)
}

func (s *Service) PreviewCleanup(items []model.ScanItem) model.CleanupReport {
	return s.deleteSvc.Preview(items)
}

func (s *Service) ExecuteCleanup(items []model.ScanItem) model.CleanupReport {
	s.mu.Lock()
	dryRun := s.settings.DryRunDefault
	s.mu.Unlock()
	if dryRun {
		report := s.deleteSvc.Preview(items)
		s.emit("cleanup:done", report)
		return report
	}
	go func() {
		ctx, cancel := s.deleteCtx()
		defer cancel()
		report := s.deleteSvc.Execute(ctx, items, false, s.emitDeleteProgress)
		if ctx.Err() != nil {
			s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
		}
		s.emit("cleanup:done", report)
	}()
	return model.CleanupReport{DryRun: false}
}

func (s *Service) ForceCleanup(items []model.ScanItem) {
	go func() {
		ctx, cancel := s.deleteCtx()
		defer cancel()
		report := s.deleteSvc.Execute(ctx, items, false, s.emitDeleteProgress)
		if ctx.Err() != nil {
			s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
		}
		s.emit("cleanup:done", report)
	}()
}

func (s *Service) ListApps() ([]model.InstalledApp, error) {
	return app.ListInstalledApps()
}

func (s *Service) ScanApps() ([]model.InstalledApp, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	apps, err := app.ScanInstalledApps(ctx, onProgress)
	if err != nil && ctx.Err() != nil {
		return apps, fmt.Errorf("scan cancelled")
	}

	filtered := make([]model.InstalledApp, 0, len(apps))
	for _, a := range apps {
		if !a.SystemApp {
			filtered = append(filtered, a)
		}
	}

	s.mu.Lock()
	s.lastApps = filtered
	s.mu.Unlock()

	s.emit("scan:done", map[string]any{"count": len(filtered)})
	return filtered, err
}

func (s *Service) GetLastAppsScan() []model.InstalledApp {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastApps
}

func (s *Service) GetAppLeftovers(appPath string) (model.LeftoverGroup, error) {
	s.mu.Lock()
	cached := s.lastApps
	s.mu.Unlock()

	target, err := app.FindAppByPath(cached, appPath)
	if err != nil {
		apps, listErr := app.ListInstalledApps()
		if listErr != nil {
			return model.LeftoverGroup{}, listErr
		}
		target, err = app.FindAppByPath(apps, appPath)
		if err != nil {
			return model.LeftoverGroup{}, err
		}
	}

	files, err := app.ScanLeftovers(context.Background(), *target, nil)
	if err != nil {
		return model.LeftoverGroup{}, err
	}
	return model.LeftoverGroup{App: *target, Files: files}, nil
}

func (s *Service) ScanAppLeftovers(appPath string) (model.LeftoverGroup, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	apps, err := app.ListInstalledApps()
	if err != nil {
		return model.LeftoverGroup{}, err
	}
	target, err := app.FindAppByPath(apps, appPath)
	if err != nil {
		return model.LeftoverGroup{}, err
	}

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	files, err := app.ScanLeftovers(ctx, *target, onProgress)
	if err != nil && ctx.Err() != nil {
		return model.LeftoverGroup{}, fmt.Errorf("scan cancelled")
	}

	s.emit("scan:done", map[string]any{
		"app":   target.Name,
		"count": len(files),
	})
	return model.LeftoverGroup{App: *target, Files: files}, err
}

func (s *Service) UninstallApp(sel model.UninstallSelection) error {
	apps, err := app.ListInstalledApps()
	if err != nil {
		return err
	}
	target, err := app.FindAppByPath(apps, sel.AppPath)
	if err != nil {
		return err
	}
	if target.SystemApp {
		return fmt.Errorf("cannot uninstall system app: %s", target.Name)
	}

	var agents []string
	var other []string
	for _, p := range sel.LeftoverPaths {
		if len(p) > 0 {
			if containsLaunchAgent(p) {
				agents = append(agents, p)
			} else {
				other = append(other, p)
			}
		}
	}

	go func() {
		_ = launchd.UnloadAgents(agents)
		paths := append([]string{sel.AppPath}, other...)
		paths = append(paths, agents...)

		ctx, cancel := s.deleteCtx()
		defer cancel()
		results := s.deleteSvc.DeletePaths(ctx, paths, "app_uninstall", s.emitDeleteProgress)
		report := s.reportFromResults(results)
		if ctx.Err() != nil {
			s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
		}
		s.emit("uninstall:done", report)
	}()
	return nil
}

func containsLaunchAgent(p string) bool {
	return strings.Contains(p, "LaunchAgents") && strings.HasSuffix(p, ".plist")
}

func (s *Service) ScanDuplicates(roots []string) ([]model.DuplicateGroup, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	normalized, err := duplicate.NormalizeRoots(roots)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	opts := duplicate.Options{ExcludeGlobs: s.settings.ExcludeGlobs}
	s.mu.Unlock()

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	groups, err := duplicate.Scan(ctx, normalized, opts, onProgress)
	if err != nil && ctx.Err() != nil {
		return groups, fmt.Errorf("scan cancelled")
	}

	s.mu.Lock()
	s.lastDupGroups = groups
	s.mu.Unlock()

	s.emit("scan:done", map[string]any{
		"count":            len(groups),
		"reclaimableBytes": duplicate.ReclaimableBytes(groups),
	})
	return groups, err
}

func (s *Service) GetLastDuplicates() []model.DuplicateGroup {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastDupGroups
}

func (s *Service) DeleteDuplicates(req model.DuplicateDeleteRequest) {
	go func() {
		var paths []string
		for _, g := range req.Groups {
			paths = append(paths, duplicate.PathsToDelete(g)...)
		}
		ctx, cancel := s.deleteCtx()
		defer cancel()
		results := s.deleteSvc.DeletePaths(ctx, paths, "duplicates", s.emitDeleteProgress)
		report := s.reportFromResults(results)
		if ctx.Err() != nil {
			s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
		}
		s.emit("cleanup:done", report)
	}()
}

func (s *Service) BuildDiskTree(root string) (*model.DirNode, error) {
	ctx, cancel := s.withCancel(s.ctx)
	defer cancel()

	onProgress := func(p model.ScanProgress) {
		s.emit("scan:progress", p)
	}

	tree, err := disk.BuildTree(ctx, root, disk.Options{MaxDepth: 4}, onProgress)
	if err != nil && ctx.Err() != nil {
		return tree, fmt.Errorf("scan cancelled")
	}

	s.mu.Lock()
	s.lastDiskTree = tree
	s.mu.Unlock()

	s.emit("scan:done", map[string]any{"root": root})
	return tree, err
}

func (s *Service) GetTopFiles(nodePath string, limit int) ([]model.DirNode, error) {
	s.mu.Lock()
	tree := s.lastDiskTree
	s.mu.Unlock()
	if tree == nil {
		return nil, fmt.Errorf("no disk tree loaded")
	}
	node := tree
	if nodePath != "" && nodePath != tree.Path {
		node = disk.FindNode(tree, nodePath)
		if node == nil {
			return nil, fmt.Errorf("path not found in tree")
		}
	}
	return disk.TopFiles(node, limit), nil
}

func (s *Service) RevealInFinder(path string) error {
	return delete.RevealInFinder(path)
}

func (s *Service) TrashPath(path string) model.DeleteResult {
	ctx, cancel := s.deleteCtx()
	defer cancel()
	results := s.deleteSvc.DeletePaths(ctx, []string{path}, "manual", s.emitDeleteProgress)
	if len(results) == 0 {
		return model.DeleteResult{Path: path, Success: false, Error: "no result"}
	}
	return results[0]
}

func (s *Service) GetAuditLogPath() string {
	return s.deleteSvc.AuditLogPath()
}

func (s *Service) RefreshPermissions() model.PermissionStatus {
	status := permission.Status()
	s.emit("permission:updated", status)
	return status
}

func (s *Service) SelectSafeOnly(items []model.ScanItem) []model.ScanItem {
	out := make([]model.ScanItem, len(items))
	copy(out, items)
	for i := range out {
		out[i].Selected = out[i].Risk == model.RiskSafe
	}
	return out
}

func (s *Service) ToggleCategory(items []model.ScanItem, categoryID string, selected bool) []model.ScanItem {
	out := make([]model.ScanItem, len(items))
	copy(out, items)
	for i := range out {
		if out[i].Category == categoryID {
			out[i].Selected = selected
		}
	}
	return out
}

func (s *Service) FormatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func (s *Service) Ping() string {
	return fmt.Sprintf("mac-cleaner ok %s", time.Now().Format(time.RFC3339))
}
