package scan

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/charlievieth/fastwalk"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
)

type ProgressFunc func(model.ScanProgress)

type Engine struct {
	catalog *catalog.Catalog
}

func NewEngine(cat *catalog.Catalog) *Engine {
	return &Engine{catalog: cat}
}

func (e *Engine) ScanJunk(ctx context.Context, onProgress ProgressFunc) ([]model.ScanItem, error) {
	if e.catalog == nil {
		return nil, fmt.Errorf("catalog not loaded")
	}

	roots := map[string]struct{}{}
	for _, cat := range e.catalog.Categories {
		for _, p := range cat.Paths {
			expanded, err := catalog.ExpandPath(p)
			if err != nil {
				continue
			}
			if catalog.IsProtected(expanded) {
				continue
			}
			if st, err := os.Stat(expanded); err != nil || !st.IsDir() {
				continue
			}
			roots[expanded] = struct{}{}
		}
	}

	rootList := make([]string, 0, len(roots))
	for root := range roots {
		rootList = append(rootList, root)
	}
	rootCount := len(rootList)
	if rootCount == 0 {
		rootCount = 1
	}

	var scanned atomic.Int64
	itemsMu := sync.Mutex{}
	items := make([]model.ScanItem, 0, 256)
	seen := map[string]struct{}{}

	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}

	emit(model.ScanProgress{
		Phase:   "starting",
		Total:   int64(rootCount),
		Percent: 0,
		Message: "Scanning for junk files...",
	})

	conf := fastwalk.Config{
		Follow: false,
	}

	var walkErr error
	for i, root := range rootList {
		select {
		case <-ctx.Done():
			return items, ctx.Err()
		default:
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

		walkFn := func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			if catalog.IsProtected(path) {
				if entry.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}

			info, err := entry.Info()
			if err != nil {
				return nil
			}
			if info.IsDir() {
				return nil
			}

			cat, ok := e.catalog.MatchCategory(path, info)
			if !ok {
				return nil
			}

			size := fileSize(path, info)
			item := catalog.CategoryToScanItem(cat, path, size)

			itemsMu.Lock()
			if _, dup := seen[item.ID]; !dup {
				seen[item.ID] = struct{}{}
				items = append(items, item)
			}
			itemsMu.Unlock()

			n := scanned.Add(1)
			if n%50 == 0 {
				inRoot := min(float64(n%500)/500.0, 0.95)
				emit(model.ScanProgress{
					Phase:       "scanning",
					CurrentPath: path,
					Scanned:     n,
					Total:       int64(rootCount),
					Percent:     rootBase + inRoot/float64(rootCount)*95,
					Message:     fmt.Sprintf("Scanned %d items...", n),
				})
			}
			return nil
		}

		err := fastwalk.Walk(&conf, root, walkFn)
		if err != nil && walkErr == nil {
			walkErr = err
		}
	}

	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: scanned.Load(),
		Total:   int64(rootCount),
		Percent: 100,
		Message: fmt.Sprintf("Found %d junk items", len(items)),
	})

	if ctx.Err() != nil {
		return items, ctx.Err()
	}
	return items, walkErr
}

func fileSize(path string, info os.FileInfo) int64 {
	if info.Size() > 0 {
		return info.Size()
	}
	st, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return st.Size()
}

func HashPath(path string) string {
	h := sha256.Sum256([]byte(path))
	return hex.EncodeToString(h[:8])
}

func Summarize(items []model.ScanItem) []model.CategorySummary {
	m := map[string]*model.CategorySummary{}
	for _, item := range items {
		c, ok := m[item.Category]
		if !ok {
			c = &model.CategorySummary{
				ID:    item.Category,
				Label: item.CategoryLbl,
				Risk:  item.Risk,
			}
			m[item.Category] = c
		}
		c.ItemCount++
		c.SizeBytes += item.SizeBytes
	}
	out := make([]model.CategorySummary, 0, len(m))
	for _, c := range m {
		out = append(out, *c)
	}
	return out
}

func DefaultWorkerCount() int {
	return 3 * runtime.GOMAXPROCS(0)
}

func ThrottleProgress(last *time.Time, every time.Duration) bool {
	now := time.Now()
	if now.Sub(*last) >= every {
		*last = now
		return true
	}
	return false
}
