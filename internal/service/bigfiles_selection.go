package service

import (
	"sort"

	"mac-cleaner/internal/model"
)

type bigFilesSelectionCache struct {
	paths      []string
	categories map[string]string
	count      int
	bytes      int64
}

func (s *Service) rebuildBigFilesSelectionLocked() {
	paths := make([]string, 0, 64)
	cats := make(map[string]string)
	var count int
	var bytes int64
	for _, item := range s.lastBigFilesItems {
		if !item.Selected {
			continue
		}
		count++
		bytes += item.SizeBytes
		paths = append(paths, item.Path)
		cats[item.Path] = item.Category
	}
	s.bigFilesSel.paths = paths
	s.bigFilesSel.categories = cats
	s.bigFilesSel.count = count
	s.bigFilesSel.bytes = bytes
}

func (s *Service) bigFilesSelectionAddLocked(item *model.ScanItem) {
	s.bigFilesSel.paths = append(s.bigFilesSel.paths, item.Path)
	if s.bigFilesSel.categories == nil {
		s.bigFilesSel.categories = make(map[string]string)
	}
	s.bigFilesSel.categories[item.Path] = item.Category
	s.bigFilesSel.count++
	s.bigFilesSel.bytes += item.SizeBytes
}

func (s *Service) bigFilesSelectionRemoveLocked(item *model.ScanItem) {
	path := item.Path
	for i, p := range s.bigFilesSel.paths {
		if p != path {
			continue
		}
		s.bigFilesSel.paths = append(s.bigFilesSel.paths[:i], s.bigFilesSel.paths[i+1:]...)
		break
	}
	delete(s.bigFilesSel.categories, path)
	s.bigFilesSel.count--
	s.bigFilesSel.bytes -= item.SizeBytes
}

func (s *Service) GetBigFilesSelectionSummary() model.SelectionSummary {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.SelectionSummary{
		Count: s.bigFilesSel.count,
		Bytes: s.bigFilesSel.bytes,
	}
}

func (s *Service) GetBigFilesCategoryRows() []model.JunkCategoryRow {
	s.mu.Lock()
	defer s.mu.Unlock()

	type acc struct {
		row           model.JunkCategoryRow
		selectedCount int
	}
	byID := make(map[string]*acc)
	for _, item := range s.lastBigFilesItems {
		a, ok := byID[item.Category]
		if !ok {
			a = &acc{
				row: model.JunkCategoryRow{
					ID:    item.Category,
					Label: item.CategoryLbl,
					Risk:  item.Risk,
				},
			}
			byID[item.Category] = a
		}
		a.row.ItemCount++
		a.row.SizeBytes += item.SizeBytes
		if item.Selected {
			a.selectedCount++
		}
	}
	out := make([]model.JunkCategoryRow, 0, len(byID))
	for _, a := range byID {
		a.row.AllSelected = a.row.ItemCount > 0 && a.selectedCount == a.row.ItemCount
		out = append(out, a.row)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SizeBytes == out[j].SizeBytes {
			return out[i].ID < out[j].ID
		}
		return out[i].SizeBytes > out[j].SizeBytes
	})
	return out
}

func (s *Service) pruneBigFilesItemsByDeleteResults(results []model.DeleteResult) {
	if len(results) == 0 {
		return
	}
	removed := make(map[string]struct{})
	for _, r := range results {
		if r.Success {
			removed[r.Path] = struct{}{}
		}
	}
	if len(removed) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	kept := s.lastBigFilesItems[:0]
	for _, item := range s.lastBigFilesItems {
		if _, ok := removed[item.Path]; ok {
			continue
		}
		kept = append(kept, item)
	}
	s.lastBigFilesItems = kept
	s.rebuildBigFilesSelectionLocked()
}
