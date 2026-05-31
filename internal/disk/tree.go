package disk

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/charlievieth/fastwalk"
	"golang.org/x/sys/unix"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
)

type ProgressFunc func(model.ScanProgress)

type Options struct {
	MaxDepth int
}

var skipDirNames = map[string]struct{}{
	".git":         {},
	".svn":         {},
	".hg":          {},
	"node_modules": {},
	"__pycache__":  {},
	".venv":        {},
	"venv":         {},
	".npm":         {},
	".yarn":        {},
	".cargo":       {},
	".cache":       {},
	"DerivedData":  {},
}

func BuildTree(ctx context.Context, root string, opts Options, onProgress ProgressFunc) (*model.DirNode, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		root = home
	} else {
		expanded, err := catalog.ExpandPath(root)
		if err != nil {
			return nil, err
		}
		root = expanded
	}
	root = filepath.Clean(root)

	st, err := os.Stat(root)
	if err != nil {
		return nil, err
	}

	maxDepth := opts.MaxDepth
	if maxDepth <= 0 {
		maxDepth = 4
	}

	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}

	emit(model.ScanProgress{Phase: "starting", Message: "Building disk map..."})

	rootNode := &model.DirNode{
		Name:      st.Name(),
		Path:      root,
		IsDir:     true,
		Children:  []*model.DirNode{},
		SizeBytes: 0,
	}

	nodeIndex := map[string]*model.DirNode{root: rootNode}
	childLinked := map[string]struct{}{}
	deepRollup := map[string]int64{}
	var scanned atomic.Int64
	var mu sync.Mutex

	var ensureDir func(dirPath string) *model.DirNode
	ensureDir = func(dirPath string) *model.DirNode {
		dirPath = filepath.Clean(dirPath)
		if dirPath == root {
			return rootNode
		}
		if depth, _ := relDepth(dirPath, root); depth > maxDepth {
			return nil
		}
		if node, ok := nodeIndex[dirPath]; ok {
			return node
		}

		parentPath := filepath.Dir(dirPath)
		parent := ensureDir(parentPath)
		if parent == nil {
			return nil
		}

		node := &model.DirNode{
			Name:      filepath.Base(dirPath),
			Path:      dirPath,
			IsDir:     true,
			Children:  []*model.DirNode{},
			SizeBytes: 0,
		}
		nodeIndex[dirPath] = node

		linkKey := parentPath + "\x00" + dirPath
		if _, ok := childLinked[linkKey]; !ok {
			childLinked[linkKey] = struct{}{}
			parent.Children = append(parent.Children, node)
		}
		return node
	}

	addFileNode := func(filePath string, size int64) {
		parentPath := filepath.Clean(filepath.Dir(filePath))
		parent := ensureDir(parentPath)
		if parent == nil {
			return
		}
		name := filepath.Base(filePath)
		linkKey := parentPath + "\x00" + filePath
		if _, ok := childLinked[linkKey]; ok {
			return
		}
		childLinked[linkKey] = struct{}{}
		parent.Children = append(parent.Children, &model.DirNode{
			Name:      name,
			Path:      filePath,
			SizeBytes: size,
			IsDir:     false,
		})
	}

	conf := fastwalk.Config{Follow: false}
	err = fastwalk.Walk(&conf, root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		path = filepath.Clean(path)
		if path == root {
			return nil
		}

		if entry.IsDir() {
			if shouldSkipDir(entry.Name(), path, root) {
				return filepath.SkipDir
			}
			depth, _ := relDepth(path, root)
			if depth <= maxDepth {
				mu.Lock()
				ensureDir(path)
				mu.Unlock()
			}
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return nil
		}

		size := fileSize(info)
		depth, _ := relDepth(path, root)
		if depth <= maxDepth {
			mu.Lock()
			addFileNode(path, size)
			mu.Unlock()
		} else {
			ancestor := deepestIndexedDir(path, root, maxDepth)
			mu.Lock()
			deepRollup[ancestor] += size
			mu.Unlock()
		}

		n := scanned.Add(1)
		if n == 1 || n%200 == 0 {
			emit(model.ScanProgress{
				Phase:       "scanning",
				CurrentPath: path,
				Scanned:     n,
				Message:     fmt.Sprintf("%d files scanned", n),
			})
		}
		return nil
	})
	if err != nil && ctx.Err() != nil {
		return nil, ctx.Err()
	}

	mu.Lock()
	computeSizes(rootNode)
	for path, extra := range deepRollup {
		for p := path; ; {
			if node, ok := nodeIndex[p]; ok && node.IsDir {
				node.SizeBytes += extra
			}
			if p == root {
				break
			}
			parent := filepath.Dir(p)
			if parent == p {
				break
			}
			p = parent
		}
	}
	mu.Unlock()

	trimDepth(rootNode, maxDepth)

	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: scanned.Load(),
		Message: "Disk map ready",
	})

	return rootNode, nil
}

func shouldSkipDir(name, path, root string) bool {
	if _, ok := skipDirNames[name]; ok {
		return true
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	rel = filepath.ToSlash(rel)
	switch {
	case strings.HasPrefix(rel, "Library/Caches"):
		return true
	case strings.HasPrefix(rel, "Library/Logs"):
		return true
	case strings.HasPrefix(rel, "Library/Developer/Xcode/DerivedData"):
		return true
	}
	return false
}

func relDepth(path, root string) (int, error) {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return 0, err
	}
	if rel == "." {
		return 0, nil
	}
	return strings.Count(rel, string(os.PathSeparator)) + 1, nil
}

func deepestIndexedDir(filePath, root string, maxDepth int) string {
	p := filepath.Dir(filepath.Clean(filePath))
	for {
		if p == root {
			return root
		}
		depth, err := relDepth(p, root)
		if err != nil {
			return root
		}
		if depth <= maxDepth {
			return p
		}
		parent := filepath.Dir(p)
		if parent == p {
			return root
		}
		p = parent
	}
}

func fileSize(info os.FileInfo) int64 {
	if sys, ok := info.Sys().(*unix.Stat_t); ok && sys.Blocks > 0 {
		return sys.Blocks * 512
	}
	return info.Size()
}

func computeSizes(node *model.DirNode) int64 {
	if !node.IsDir {
		return node.SizeBytes
	}
	var total int64
	for _, child := range node.Children {
		total += computeSizes(child)
	}
	node.SizeBytes = total
	return total
}

func trimDepth(node *model.DirNode, depth int) {
	if depth <= 0 || !node.IsDir {
		node.Children = nil
		return
	}
	for _, child := range node.Children {
		if child.IsDir {
			trimDepth(child, depth-1)
		}
	}
}

func GetDiskSummary() (model.DiskSummary, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return model.DiskSummary{}, err
	}

	var stat unix.Statfs_t
	if err := unix.Statfs(home, &stat); err != nil {
		return model.DiskSummary{}, err
	}

	total := uint64(stat.Blocks) * uint64(stat.Bsize)
	free := uint64(stat.Bavail) * uint64(stat.Bsize)
	used := total - free

	volName := home
	if len(stat.Mntfromname) > 0 {
		volName = unix.ByteSliceToString(stat.Mntfromname[:])
	}

	return model.DiskSummary{
		TotalBytes: total,
		UsedBytes:  used,
		FreeBytes:  free,
		VolumeName: volName,
		MountPoint: home,
	}, nil
}

func TopFiles(node *model.DirNode, limit int) []model.DirNode {
	if limit <= 0 {
		limit = 20
	}
	var files []model.DirNode
	collectFiles(node, &files)
	sort.Slice(files, func(i, j int) bool {
		return files[i].SizeBytes > files[j].SizeBytes
	})
	if len(files) > limit {
		files = files[:limit]
	}
	return files
}

func collectFiles(node *model.DirNode, out *[]model.DirNode) {
	if node == nil {
		return
	}
	if !node.IsDir {
		*out = append(*out, *node)
		return
	}
	for _, child := range node.Children {
		collectFiles(child, out)
	}
}

func FindNode(root *model.DirNode, path string) *model.DirNode {
	if root == nil {
		return nil
	}
	if root.Path == path {
		return root
	}
	for _, child := range root.Children {
		if found := FindNode(child, path); found != nil {
			return found
		}
	}
	return nil
}
