package model

type Risk string

const (
	RiskSafe     Risk = "safe"
	RiskModerate Risk = "moderate"
	RiskRisky    Risk = "risky"
	RiskManual   Risk = "manual"
)

type ScanItem struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Category    string `json:"category"`
	CategoryLbl string `json:"categoryLabel"`
	SizeBytes   int64  `json:"sizeBytes"`
	Risk        Risk   `json:"risk"`
	Description string `json:"description"`
	Selected    bool   `json:"selected"`
}

type CategorySummary struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Risk      Risk   `json:"risk"`
	ItemCount int    `json:"itemCount"`
	SizeBytes int64  `json:"sizeBytes"`
}

type CleanupReport struct {
	DryRun      bool              `json:"dryRun"`
	Items       []ScanItem        `json:"items"`
	Categories  []CategorySummary `json:"categories"`
	TotalBytes  int64             `json:"totalBytes"`
	Deleted     int               `json:"deleted"`
	Failed      int               `json:"failed"`
	FailedPaths []string          `json:"failedPaths,omitempty"`
}

type InstalledApp struct {
	Name      string `json:"name"`
	BundleID  string `json:"bundleId"`
	Path      string `json:"path"`
	Version   string `json:"version"`
	SizeBytes int64  `json:"sizeBytes"`
	SystemApp bool   `json:"systemApp"`
}

type LeftoverFile struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
	Kind      string `json:"kind"`
}

type LeftoverGroup struct {
	App   InstalledApp   `json:"app"`
	Files []LeftoverFile `json:"files"`
}

type UninstallSelection struct {
	AppPath      string   `json:"appPath"`
	LeftoverPaths []string `json:"leftoverPaths"`
}

type DuplicateGroup struct {
	Hash      string   `json:"hash"`
	SizeBytes int64    `json:"sizeBytes"`
	Paths     []string `json:"paths"`
	Keeper    string   `json:"keeper"`
}

type DuplicateDeleteRequest struct {
	Groups []DuplicateGroup `json:"groups"`
}

type DirNode struct {
	Name      string     `json:"name"`
	Path      string     `json:"path"`
	SizeBytes int64      `json:"sizeBytes"`
	IsDir     bool       `json:"isDir"`
	Children  []*DirNode `json:"children,omitempty"`
}

type DiskSummary struct {
	TotalBytes uint64 `json:"totalBytes"`
	UsedBytes  uint64 `json:"usedBytes"`
	FreeBytes  uint64 `json:"freeBytes"`
	VolumeName string `json:"volumeName"`
	MountPoint string `json:"mountPoint"`
}

type PermissionStatus struct {
	FullDiskAccess string `json:"fullDiskAccess"`
	HomeDir        string `json:"homeDir"`
}

type ScanProgress struct {
	Phase       string  `json:"phase"`
	CurrentPath string  `json:"currentPath,omitempty"`
	Scanned     int64   `json:"scanned"`
	Total       int64   `json:"total,omitempty"`
	Percent     float64 `json:"percent"`
	Message     string  `json:"message,omitempty"`
}

type AppSettings struct {
	DryRunDefault     bool     `json:"dryRunDefault"`
	ExcludeGlobs      []string `json:"excludeGlobs"`
	BigFilesMinBytes  int64    `json:"bigFilesMinBytes"`
}

type BigFilesScanRequest struct {
	Roots           []string `json:"roots"`
	MinSizeBytes    int64    `json:"minSizeBytes"`
	IncludeBigFiles bool     `json:"includeBigFiles"`
	IncludeArchives bool     `json:"includeArchives"`
}

type DeleteResult struct {
	Path    string `json:"path"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}
