package duplicate

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/charlievieth/fastwalk"
	"lukechampine.com/blake3"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
)

type Options struct {
	MinSizeBytes int64
	ExcludeGlobs []string
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
	return []string{home}, nil
}

func Scan(ctx context.Context, roots []string, opts Options, onProgress ProgressFunc) ([]model.DuplicateGroup, error) {
	if len(roots) == 0 {
		var err error
		roots, err = DefaultRoots()
		if err != nil {
			return nil, err
		}
	}

	excludes := append(defaultExcludes, opts.ExcludeGlobs...)
	minSize := opts.MinSizeBytes
	if minSize <= 0 {
		minSize = 1024
	}

	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}

	emit(model.ScanProgress{Phase: "starting", Percent: 0, Message: "Scanning for duplicate files..."})

	sizeMap := map[int64][]string{}
	var scanned atomic.Int64
	var mu sync.Mutex

	conf := fastwalk.Config{Follow: false}

	for _, root := range roots {
		if _, err := os.Stat(root); err != nil {
			continue
		}
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

			rel := path
			for _, ex := range excludes {
				if matched, _ := doublestar.PathMatch(ex, rel); matched {
					return nil
				}
			}

			info, err := entry.Info()
			if err != nil || info.IsDir() {
				return nil
			}
			size := info.Size()
			if size < minSize {
				return nil
			}

			mu.Lock()
			sizeMap[size] = append(sizeMap[size], path)
			mu.Unlock()

			n := scanned.Add(1)
			if n%100 == 0 {
				emit(model.ScanProgress{
					Phase:       "scanning",
					CurrentPath: path,
					Scanned:     n,
					Percent:     min(float64(n)/2000.0*45, 45),
					Message:     fmt.Sprintf("Indexed %d files...", n),
				})
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	emit(model.ScanProgress{Phase: "hashing", Percent: 45, Message: "Hashing candidate files..."})

	type job struct {
		size  int64
		paths []string
	}
	jobs := make([]job, 0)
	for size, paths := range sizeMap {
		if len(paths) > 1 {
			jobs = append(jobs, job{size: size, paths: paths})
		}
	}

	groups := make([]model.DuplicateGroup, 0)
	var groupsMu sync.Mutex
	var hashed atomic.Int64

	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup

	for _, j := range jobs {
		select {
		case <-ctx.Done():
			return groups, ctx.Err()
		default:
		}

		wg.Add(1)
		sem <- struct{}{}
		go func(j job) {
			defer wg.Done()
			defer func() { <-sem }()

			hashGroups := hashPaths(j.paths)
			for hash, paths := range hashGroups {
				if len(paths) < 2 {
					continue
				}
				sort.Strings(paths)
				keeper := pickKeeper(paths)
				groupsMu.Lock()
				groups = append(groups, model.DuplicateGroup{
					Hash:      hash,
					SizeBytes: j.size,
					Paths:     paths,
					Keeper:    keeper,
				})
				groupsMu.Unlock()
			}
			n := hashed.Add(1)
			if n%10 == 0 {
				jobCount := len(jobs)
				if jobCount == 0 {
					jobCount = 1
				}
				emit(model.ScanProgress{
					Phase:   "hashing",
					Scanned: n,
					Total:   int64(jobCount),
					Percent: 45 + float64(n)/float64(jobCount)*55,
					Message: fmt.Sprintf("Hashed %d/%d size groups...", n, jobCount),
				})
			}
		}(j)
	}
	wg.Wait()

	sort.Slice(groups, func(i, j int) bool {
		if groups[i].SizeBytes != groups[j].SizeBytes {
			return groups[i].SizeBytes > groups[j].SizeBytes
		}
		return len(groups[i].Paths) > len(groups[j].Paths)
	})

	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: int64(len(groups)),
		Percent: 100,
		Message: fmt.Sprintf("Found %d duplicate groups", len(groups)),
	})

	if ctx.Err() != nil {
		return groups, ctx.Err()
	}
	return groups, nil
}

func hashPaths(paths []string) map[string][]string {
	result := map[string][]string{}
	for _, path := range paths {
		hash, err := fileHash(path)
		if err != nil {
			continue
		}
		result[hash] = append(result[hash], path)
	}
	return result
}

func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := blake3.New(32, nil)
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func pickKeeper(paths []string) string {
	if len(paths) == 0 {
		return ""
	}
	best := paths[0]
	bestInfo, statErr := os.Stat(best)
	if statErr != nil {
		return best
	}
	for _, p := range paths[1:] {
		info, statErr := os.Stat(p)
		if statErr != nil {
			continue
		}
		if info.ModTime().After(bestInfo.ModTime()) {
			best = p
			bestInfo = info
		} else if info.ModTime().Equal(bestInfo.ModTime()) && len(p) < len(best) {
			best = p
			bestInfo = info
		}
	}
	return best
}

func ReclaimableBytes(groups []model.DuplicateGroup) int64 {
	var total int64
	for _, g := range groups {
		total += g.SizeBytes * int64(len(g.Paths)-1)
	}
	return total
}

func PathsToDelete(group model.DuplicateGroup) []string {
	var out []string
	for _, p := range group.Paths {
		if p != group.Keeper {
			out = append(out, p)
		}
	}
	return out
}

func NormalizeRoots(roots []string) ([]string, error) {
	if len(roots) == 0 {
		return nil, nil
	}
	out := make([]string, 0, len(roots))
	for _, r := range roots {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		expanded, err := catalog.ExpandPath(r)
		if err != nil {
			return nil, err
		}
		out = append(out, expanded)
	}
	return out, nil
}
