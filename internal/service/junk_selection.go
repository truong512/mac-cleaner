package service

import (
	"sort"

	"mac-cleaner/internal/model"
)

type junkSelectionCache struct {
	paths      []string
	categories map[string]string
	count      int
	bytes      int64
}

func (s *Service) rebuildJunkSelectionLocked() {
	paths := make([]string, 0, 64)
	cats := make(map[string]string)
	var count int
	var bytes int64
	for _, item := range s.lastJunkItems {
		if !item.Selected {
			continue
		}
		count++
		bytes += item.SizeBytes
		paths = append(paths, item.Path)
		cats[item.Path] = item.Category
	}
	s.junkSel.paths = paths
	s.junkSel.categories = cats
	s.junkSel.count = count
	s.junkSel.bytes = bytes
}

func (s *Service) junkSelectionAddLocked(item *model.ScanItem) {
	s.junkSel.paths = append(s.junkSel.paths, item.Path)
	if s.junkSel.categories == nil {
		s.junkSel.categories = make(map[string]string)
	}
	s.junkSel.categories[item.Path] = item.Category
	s.junkSel.count++
	s.junkSel.bytes += item.SizeBytes
}

func (s *Service) junkSelectionRemoveLocked(item *model.ScanItem) {
	path := item.Path
	for i, p := range s.junkSel.paths {
		if p != path {
			continue
		}
		s.junkSel.paths = append(s.junkSel.paths[:i], s.junkSel.paths[i+1:]...)
		break
	}
	delete(s.junkSel.categories, path)
	s.junkSel.count--
	s.junkSel.bytes -= item.SizeBytes
}

func (s *Service) GetJunkSelectionSummary() model.SelectionSummary {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.SelectionSummary{
		Count: s.junkSel.count,
		Bytes: s.junkSel.bytes,
	}
}

func (s *Service) GetJunkCategoryRows() []model.JunkCategoryRow {
	s.mu.Lock()
	defer s.mu.Unlock()

	type acc struct {
		row           model.JunkCategoryRow
		selectedCount int
	}
	byID := make(map[string]*acc)
	for _, item := range s.lastJunkItems {
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
		a.row.SelectedCount = a.selectedCount
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

func (s *Service) pruneJunkItemsByDeleteResults(results []model.DeleteResult) {
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
	kept := s.lastJunkItems[:0]
	for _, item := range s.lastJunkItems {
		if _, ok := removed[item.Path]; ok {
			continue
		}
		kept = append(kept, item)
	}
	s.lastJunkItems = kept
	s.rebuildJunkSelectionLocked()
}

func cloneJunkCategories(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
