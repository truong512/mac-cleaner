package bigfiles

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync/atomic"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/charlievieth/fastwalk"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/duplicate"
	"mac-cleaner/internal/model"
)

const DefaultMinSizeBytes = 50 * 1024 * 1024 // 50 MB

var DefaultArchiveExtensions = []string{
	".zip", ".tar", ".gz", ".tgz", ".bz2", ".tbz", ".tbz2",
	".7z", ".dmg", ".pkg", ".iso", ".rar", ".xz", ".zipx",
}

type Options struct {
	Roots           []string
	MinSizeBytes    int64
	IncludeBigFiles bool
	IncludeArchives bool
	ExcludeGlobs    []string
}

type ProgressFunc func(model.ScanProgress)

var defaultExcludes = []string{
	"**/.git/**",
	"**/node_modules/**",
	"**/*.app/**",
	"**/.DS_Store",
}

func DefaultRoots() ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	return []string{
		filepath.Join(home, "Documents"),
		filepath.Join(home, "Downloads"),
		filepath.Join(home, "Desktop"),
	}, nil
}

func Scan(ctx context.Context, opts Options, onProgress ProgressFunc) ([]model.ScanItem, error) {
	roots, err := duplicate.NormalizeRoots(opts.Roots)
	if err != nil {
		return nil, err
	}
	if len(roots) == 0 {
		roots, err = DefaultRoots()
		if err != nil {
			return nil, err
		}
	}

	minSize := opts.MinSizeBytes
	if minSize <= 0 {
		minSize = DefaultMinSizeBytes
	}
	includeBig := opts.IncludeBigFiles
	includeArchives := opts.IncludeArchives
	if !includeBig && !includeArchives {
		includeBig = true
		includeArchives = true
	}

	excludes := append(defaultExcludes, opts.ExcludeGlobs...)
	archiveExts := map[string]struct{}{}
	for _, ext := range DefaultArchiveExtensions {
		archiveExts[strings.ToLower(ext)] = struct{}{}
	}

	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}
	emit(model.ScanProgress{
		Phase:   "starting",
		Total:   int64(len(roots)),
		Percent: 0,
		Message: "Scanning for large and archive files...",
	})

	items := make([]model.ScanItem, 0)
	seen := map[string]struct{}{}
	var scanned atomic.Int64
	rootCount := len(roots)
	if rootCount == 0 {
		rootCount = 1
	}

	conf := fastwalk.Config{Follow: false}

	for i, root := range roots {
		if catalog.IsProtected(root) {
			continue
		}
		if _, err := os.Stat(root); err != nil {
			continue
		}

		rootBase := float64(i) / float64(rootCount) * 95
		emit(model.ScanProgress{
			Phase:       "scanning",
			CurrentPath: root,
			Scanned:     int64(i),
			Total:       int64(rootCount),
			Percent:     rootBase,
			Message:     fmt.Sprintf("Scanning %s...", filepath.Base(root)),
		})

		err := fastwalk.Walk(&conf, root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			if entry.IsDir() {
				return nil
			}
			if catalog.IsProtected(path) {
				return nil
			}

			for _, ex := range excludes {
				if matched, _ := doublestar.PathMatch(ex, path); matched {
					return nil
				}
			}

			info, err := entry.Info()
			if err != nil || info.IsDir() {
				return nil
			}

			size := info.Size()
			ext := strings.ToLower(filepath.Ext(path))
			_, isArchive := archiveExts[ext]

			var category, label string
			var risk model.Risk
			switch {
			case includeArchives && isArchive:
				category = "archives"
				label = "Archives"
				risk = model.RiskModerate
			case includeBig && size >= minSize:
				category = "big_files"
				label = "Large Files"
				risk = model.RiskRisky
			default:
				return nil
			}

			if _, ok := seen[path]; ok {
				return nil
			}
			seen[path] = struct{}{}

			items = append(items, model.ScanItem{
				ID:          category + ":" + path,
				Path:        path,
				Category:    category,
				CategoryLbl: label,
				SizeBytes:   size,
				Risk:        risk,
				Description: fmt.Sprintf("%s (%s)", filepath.Base(path), formatSize(size)),
				Selected:    false,
			})

			n := scanned.Add(1)
			if n%50 == 0 {
				emit(model.ScanProgress{
					Phase:       "scanning",
					CurrentPath: path,
					Scanned:     n,
					Total:       int64(rootCount),
					Percent:     rootBase + min(float64(n%300)/300.0, 0.95)/float64(rootCount)*95,
					Message:     fmt.Sprintf("Found %d files...", n),
				})
			}
			return nil
		})
		if err != nil {
			return items, err
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].SizeBytes != items[j].SizeBytes {
			return items[i].SizeBytes > items[j].SizeBytes
		}
		return items[i].Path < items[j].Path
	})

	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: int64(len(items)),
		Total:   int64(rootCount),
		Percent: 100,
		Message: fmt.Sprintf("Found %d files", len(items)),
	})

	if ctx.Err() != nil {
		return items, ctx.Err()
	}
	return items, nil
}

func formatSize(b int64) string {
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

func TotalBytes(items []model.ScanItem) int64 {
	var total int64
	for _, item := range items {
		total += item.SizeBytes
	}
	return total
}
