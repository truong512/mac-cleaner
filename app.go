package main

import (
	"context"

	"mac-cleaner/internal/model"
	"mac-cleaner/internal/service"
)

type App struct {
	ctx context.Context
	svc *service.Service
}

func NewApp() *App {
	svc, err := service.New()
	if err != nil {
		panic(err)
	}
	return &App{svc: svc}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.svc.Startup(ctx)
}

func (a *App) GetDiskSummary() (model.DiskSummary, error) {
	return a.svc.GetDiskSummary()
}

func (a *App) GetPermissionStatus() model.PermissionStatus {
	return a.svc.GetPermissionStatus()
}

func (a *App) OpenFullDiskAccessSettings() error {
	return a.svc.OpenFullDiskAccessSettings()
}

func (a *App) RefreshPermissions() model.PermissionStatus {
	return a.svc.RefreshPermissions()
}

func (a *App) GetSettings() model.AppSettings {
	return a.svc.GetSettings()
}

func (a *App) SaveSettings(settings model.AppSettings) {
	a.svc.SaveSettings(settings)
}

func (a *App) GetCatalogCategories() []model.CategorySummary {
	return a.svc.GetCatalogCategories()
}

func (a *App) ScanJunk() ([]model.ScanItem, error) {
	return a.svc.ScanJunk()
}

func (a *App) GetLastJunkScan() []model.ScanItem {
	return a.svc.GetLastJunkScan()
}

func (a *App) ScanBigFiles(req model.BigFilesScanRequest) ([]model.ScanItem, error) {
	return a.svc.ScanBigFiles(req)
}

func (a *App) GetLastBigFilesScan() []model.ScanItem {
	return a.svc.GetLastBigFilesScan()
}

func (a *App) GetBigFilesDefaults() model.BigFilesScanRequest {
	return a.svc.GetBigFilesDefaults()
}

func (a *App) SelectArchivesOnly(items []model.ScanItem) []model.ScanItem {
	return a.svc.SelectArchivesOnly(items)
}

func (a *App) SelectBigFilesOnly(items []model.ScanItem) []model.ScanItem {
	return a.svc.SelectBigFilesOnly(items)
}

func (a *App) PreviewCleanup(items []model.ScanItem) model.CleanupReport {
	return a.svc.PreviewCleanup(items)
}

func (a *App) ExecuteCleanup(items []model.ScanItem) model.CleanupReport {
	return a.svc.ExecuteCleanup(items)
}

func (a *App) ForceCleanup(items []model.ScanItem) {
	a.svc.ForceCleanup(items)
}

func (a *App) SelectSafeOnly(items []model.ScanItem) []model.ScanItem {
	return a.svc.SelectSafeOnly(items)
}

func (a *App) ToggleCategory(items []model.ScanItem, categoryID string, selected bool) []model.ScanItem {
	return a.svc.ToggleCategory(items, categoryID, selected)
}

func (a *App) CancelScan() {
	a.svc.CancelOperation()
}

func (a *App) CancelOperation() {
	a.svc.CancelOperation()
}

func (a *App) ListApps() ([]model.InstalledApp, error) {
	return a.svc.ListApps()
}

func (a *App) ScanApps() ([]model.InstalledApp, error) {
	return a.svc.ScanApps()
}

func (a *App) GetLastAppsScan() []model.InstalledApp {
	return a.svc.GetLastAppsScan()
}

func (a *App) GetAppLeftovers(appPath string) (model.LeftoverGroup, error) {
	return a.svc.GetAppLeftovers(appPath)
}

func (a *App) ScanAppLeftovers(appPath string) (model.LeftoverGroup, error) {
	return a.svc.ScanAppLeftovers(appPath)
}

func (a *App) UninstallApp(sel model.UninstallSelection) error {
	return a.svc.UninstallApp(sel)
}

func (a *App) ScanDuplicates(roots []string) ([]model.DuplicateGroup, error) {
	return a.svc.ScanDuplicates(roots)
}

func (a *App) GetLastDuplicates() []model.DuplicateGroup {
	return a.svc.GetLastDuplicates()
}

func (a *App) DeleteDuplicates(req model.DuplicateDeleteRequest) {
	a.svc.DeleteDuplicates(req)
}

func (a *App) BuildDiskTree(root string) (*model.DirNode, error) {
	return a.svc.BuildDiskTree(root)
}

func (a *App) GetTopFiles(nodePath string, limit int) ([]model.DirNode, error) {
	return a.svc.GetTopFiles(nodePath, limit)
}

func (a *App) RevealInFinder(path string) error {
	return a.svc.RevealInFinder(path)
}

func (a *App) TrashPath(path string) model.DeleteResult {
	return a.svc.TrashPath(path)
}

func (a *App) GetAuditLogPath() string {
	return a.svc.GetAuditLogPath()
}

func (a *App) FormatBytes(b int64) string {
	return a.svc.FormatBytes(b)
}

func (a *App) Ping() string {
	return a.svc.Ping()
}
