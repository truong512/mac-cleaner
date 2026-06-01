package disk

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
)

// ListChildren reads one directory level from disk for Space Map drill-down past scan depth.
func ListChildren(dirPath string) ([]model.DirNode, error) {
	dirPath = expandDirPath(dirPath)
	if dirPath == "" {
		return nil, os.ErrInvalid
	}
	dirPath = filepath.Clean(dirPath)

	st, err := os.Stat(dirPath)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return nil, os.ErrInvalid
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	nodes := make([]model.DirNode, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if name == "." || name == ".." {
			continue
		}
		full := filepath.Join(dirPath, name)
		if entry.IsDir() {
			if _, skip := skipDirNames[name]; skip {
				continue
			}
			nodes = append(nodes, model.DirNode{
				Name:      name,
				Path:      full,
				IsDir:     true,
				SizeBytes: dirListingSize(full),
			})
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		nodes = append(nodes, model.DirNode{
			Name:      name,
			Path:      full,
			IsDir:     false,
			SizeBytes: fileSize(info),
		})
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].SizeBytes == nodes[j].SizeBytes {
			return nodes[i].Name < nodes[j].Name
		}
		return nodes[i].SizeBytes > nodes[j].SizeBytes
	})
	return nodes, nil
}

func expandDirPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	expanded, err := catalog.ExpandPath(path)
	if err != nil {
		return filepath.Clean(path)
	}
	return filepath.Clean(expanded)
}

// dirListingSize is a fast lower-bound: sum of immediate file sizes (not recursive).
func dirListingSize(dirPath string) int64 {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	var total int64
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		total += fileSize(info)
	}
	return total
}
