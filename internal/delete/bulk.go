package delete

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"mac-cleaner/internal/model"
)

const deleteProgressInterval = 50 * time.Millisecond

func deleteWorkerCount() int {
	n := runtime.GOMAXPROCS(0) * 2
	if n < 4 {
		return 4
	}
	if n > 16 {
		return 16
	}
	return n
}

const pruneNestedThreshold = 5000

// PrunePathsForDelete removes duplicates and paths nested under another deleted path.
func PrunePathsForDelete(paths []string) []string {
	if len(paths) <= 1 {
		return paths
	}
	seen := make(map[string]struct{}, len(paths))
	unique := make([]string, 0, len(paths))
	for _, p := range paths {
		clean := filepath.Clean(p)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		unique = append(unique, clean)
	}
	if len(unique) > pruneNestedThreshold {
		return unique
	}
	sort.Slice(unique, func(i, j int) bool {
		if len(unique[i]) == len(unique[j]) {
			return unique[i] < unique[j]
		}
		return len(unique[i]) < len(unique[j])
	})

	kept := make([]string, 0, len(unique))
	keptSet := make(map[string]struct{}, len(unique))
	for _, p := range unique {
		if pathHasAncestorInSet(p, keptSet) {
			continue
		}
		filtered := kept[:0]
		for _, k := range kept {
			if !isDescendantPath(k, p) {
				filtered = append(filtered, k)
			} else {
				delete(keptSet, k)
			}
		}
		kept = append(filtered, p)
		keptSet[p] = struct{}{}
	}
	return kept
}

func pathHasAncestorInSet(path string, ancestors map[string]struct{}) bool {
	for p := filepath.Dir(path); p != path; p = filepath.Dir(p) {
		if p == "." || p == "/" {
			break
		}
		if _, ok := ancestors[p]; ok {
			return true
		}
	}
	return false
}

func isDescendantPath(path, ancestor string) bool {
	if path == ancestor {
		return false
	}
	prefix := ancestor + string(os.PathSeparator)
	return strings.HasPrefix(path, prefix)
}

func (s *Service) deletePathsBulk(ctx context.Context, paths []string, defaultCategory string, categories map[string]string, onProgress ProgressFunc) []model.DeleteResult {
	paths = PrunePathsForDelete(paths)
	total := len(paths)
	if total == 0 {
		emitDeleteDone(onProgress, 0)
		return nil
	}

	emitDeleteStarting(onProgress, total)

	workers := deleteWorkerCount()
	jobs := make(chan string)
	var wg sync.WaitGroup
	var completed atomic.Int64
	var emitMu sync.Mutex
	var lastEmit time.Time

	resultsMu := sync.Mutex{}
	results := make([]model.DeleteResult, 0, total)

	emit := func(done int64, lastPath string) {
		if onProgress == nil {
			return
		}
		emitMu.Lock()
		defer emitMu.Unlock()
		now := time.Now()
		if int(done) < total && now.Sub(lastEmit) < deleteProgressInterval {
			return
		}
		lastEmit = now
		emitDeleteProgress(onProgress, int(done), total, lastPath)
	}

	categoryFor := func(path string) string {
		if categories != nil {
			if cat, ok := categories[path]; ok && cat != "" {
				return cat
			}
		}
		return defaultCategory
	}

	worker := func() {
		defer wg.Done()
		for path := range jobs {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return
			}
			res := s.deleteOne(path, categoryFor(path))
			resultsMu.Lock()
			results = append(results, res)
			resultsMu.Unlock()
			done := completed.Add(1)
			emit(done, path)
		}
	}

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go worker()
	}

	for _, p := range paths {
		if ctx.Err() != nil {
			break
		}
		jobs <- p
	}
	close(jobs)
	wg.Wait()

	done := int(completed.Load())
	if ctx.Err() != nil {
		emitDeleteCancelled(onProgress, done, total)
		return results
	}
	emitDeleteProgress(onProgress, total, total, "")
	emitDeleteDone(onProgress, total)
	return results
}

func (s *Service) DeletePaths(ctx context.Context, paths []string, category string, onProgress ProgressFunc) []model.DeleteResult {
	return s.deletePathsBulk(ctx, paths, category, nil, onProgress)
}

func (s *Service) DeletePathsWithCategories(ctx context.Context, paths []string, category string, categories map[string]string, onProgress ProgressFunc) []model.DeleteResult {
	return s.deletePathsBulk(ctx, paths, category, categories, onProgress)
}

func (s *Service) deleteItemsWithProgress(ctx context.Context, items []model.ScanItem, onProgress ProgressFunc) []model.DeleteResult {
	paths := make([]string, 0, len(items))
	categories := make(map[string]string, len(items))
	for _, item := range items {
		paths = append(paths, item.Path)
		categories[item.Path] = item.Category
	}
	return s.deletePathsBulk(ctx, paths, "cleanup", categories, onProgress)
}
