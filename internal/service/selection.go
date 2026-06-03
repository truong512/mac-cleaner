package service

import (
	"mac-cleaner/internal/duplicate"
	"mac-cleaner/internal/model"
)

func (s *Service) ApplyJunkSelectedIDs(ids []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	selected := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		selected[id] = struct{}{}
	}
	for i := range s.lastJunkItems {
		s.lastJunkItems[i].Selected = false
		if _, ok := selected[s.lastJunkItems[i].ID]; ok {
			s.lastJunkItems[i].Selected = true
		}
	}
	s.rebuildJunkSelectionLocked()
}

func (s *Service) SetJunkItemSelected(id string, selected bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastJunkItems {
		if s.lastJunkItems[i].ID != id {
			continue
		}
		item := &s.lastJunkItems[i]
		if item.Selected == selected {
			return
		}
		item.Selected = selected
		if selected {
			s.junkSelectionAddLocked(item)
		} else {
			s.junkSelectionRemoveLocked(item)
		}
		return
	}
}

func (s *Service) SetJunkCategorySelected(categoryID string, selected bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastJunkItems {
		if s.lastJunkItems[i].Category == categoryID {
			s.lastJunkItems[i].Selected = selected
		}
	}
	s.rebuildJunkSelectionLocked()
}

func (s *Service) SelectJunkSafeOnly() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastJunkItems {
		s.lastJunkItems[i].Selected = s.lastJunkItems[i].Risk == model.RiskSafe
	}
	s.rebuildJunkSelectionLocked()
}

func (s *Service) SelectJunkByTags(tags []string) {
	ids := s.catalog.CategoryIDsByTags(tags)
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastJunkItems {
		_, ok := idSet[s.lastJunkItems[i].Category]
		s.lastJunkItems[i].Selected = ok
	}
	s.rebuildJunkSelectionLocked()
}

func (s *Service) FilterJunkCategoryIDsByTags(tags []string) []string {
	return s.catalog.CategoryIDsByTags(tags)
}

func (s *Service) CleanupLastJunk(permanent bool) {
	go s.runJunkCleanup(permanent)
}

func (s *Service) runJunkCleanup(permanent bool) {
	s.mu.Lock()
	paths := append([]string(nil), s.junkSel.paths...)
	cats := cloneJunkCategories(s.junkSel.categories)
	total := s.junkSel.count
	s.mu.Unlock()

	if len(paths) == 0 {
		s.emit("cleanup:done", model.CleanupReport{DryRun: false})
		return
	}

	mode := deleteMode(permanent)
	s.emitDeleteProgress(model.ScanProgress{
		Phase:   "deleting",
		Scanned: 0,
		Total:   int64(total),
		Percent: 0,
		Message: mode.StartingMessage(total),
	})

	ctx, cancel := s.deleteCtx()
	defer cancel()
	results := s.deleteSvc.DeletePathsWithCategories(ctx, paths, "cleanup", cats, mode, s.emitDeleteProgress)
	report := s.reportFromResults(results)
	s.pruneJunkItemsByDeleteResults(results)
	if ctx.Err() != nil {
		s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
	}
	s.emit("cleanup:done", report)
}

func (s *Service) PreviewLastJunk() model.CleanupReport {
	s.mu.Lock()
	selected := make([]model.ScanItem, 0, s.junkSel.count)
	for _, item := range s.lastJunkItems {
		if item.Selected {
			selected = append(selected, item)
		}
	}
	s.mu.Unlock()
	return s.deleteSvc.Preview(selected)
}

func (s *Service) ApplyBigFilesSelectedIDs(ids []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	selected := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		selected[id] = struct{}{}
	}
	for i := range s.lastBigFilesItems {
		s.lastBigFilesItems[i].Selected = false
		if _, ok := selected[s.lastBigFilesItems[i].ID]; ok {
			s.lastBigFilesItems[i].Selected = true
		}
	}
	s.rebuildBigFilesSelectionLocked()
}

func (s *Service) SetBigFilesItemSelected(id string, selected bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastBigFilesItems {
		if s.lastBigFilesItems[i].ID != id {
			continue
		}
		item := &s.lastBigFilesItems[i]
		if item.Selected == selected {
			return
		}
		item.Selected = selected
		if selected {
			s.bigFilesSelectionAddLocked(item)
		} else {
			s.bigFilesSelectionRemoveLocked(item)
		}
		return
	}
}

func (s *Service) SetBigFilesCategorySelected(categoryID string, selected bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastBigFilesItems {
		if s.lastBigFilesItems[i].Category == categoryID {
			s.lastBigFilesItems[i].Selected = selected
		}
	}
	s.rebuildBigFilesSelectionLocked()
}

func (s *Service) SelectBigFilesArchivesOnly() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastBigFilesItems {
		s.lastBigFilesItems[i].Selected = s.lastBigFilesItems[i].Category == "archives"
	}
	s.rebuildBigFilesSelectionLocked()
}

func (s *Service) SelectBigFilesLargeOnly() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.lastBigFilesItems {
		s.lastBigFilesItems[i].Selected = s.lastBigFilesItems[i].Category == "big_files"
	}
	s.rebuildBigFilesSelectionLocked()
}

func (s *Service) CleanupLastBigFiles(permanent bool) {
	go s.runBigFilesCleanup(permanent)
}

func (s *Service) runBigFilesCleanup(permanent bool) {
	s.mu.Lock()
	paths := append([]string(nil), s.bigFilesSel.paths...)
	cats := cloneJunkCategories(s.bigFilesSel.categories)
	total := s.bigFilesSel.count
	s.mu.Unlock()

	if len(paths) == 0 {
		s.emit("cleanup:done", model.CleanupReport{DryRun: false})
		return
	}

	mode := deleteMode(permanent)
	s.emitDeleteProgress(model.ScanProgress{
		Phase:   "deleting",
		Scanned: 0,
		Total:   int64(total),
		Percent: 0,
		Message: mode.StartingMessage(total),
	})

	ctx, cancel := s.deleteCtx()
	defer cancel()
	results := s.deleteSvc.DeletePathsWithCategories(ctx, paths, "cleanup", cats, mode, s.emitDeleteProgress)
	report := s.reportFromResults(results)
	s.pruneBigFilesItemsByDeleteResults(results)
	if ctx.Err() != nil {
		s.emit("delete:cancelled", map[string]string{"message": "Delete cancelled"})
	}
	s.emit("cleanup:done", report)
}

func (s *Service) PreviewLastBigFiles() model.CleanupReport {
	s.mu.Lock()
	selected := make([]model.ScanItem, 0, s.bigFilesSel.count)
	for _, item := range s.lastBigFilesItems {
		if item.Selected {
			selected = append(selected, item)
		}
	}
	s.mu.Unlock()
	return s.deleteSvc.Preview(selected)
}

func (s *Service) SetDuplicateKeepers(keepers map[string]string) {
	s.mu.Lock()
	s.lastDupKeepers = cloneKeepers(keepers)
	s.mu.Unlock()
}

func (s *Service) CleanupLastDuplicates(permanent bool) {
	s.mu.Lock()
	groups := s.lastDupGroups
	keepers := s.lastDupKeepers
	s.mu.Unlock()
	if keepers == nil {
		keepers = map[string]string{}
	}
	var paths []string
	for _, g := range groups {
		keeper := keepers[g.Hash]
		if keeper == "" {
			keeper = g.Keeper
		}
		g.Keeper = keeper
		paths = append(paths, duplicate.PathsToDelete(g)...)
	}
	s.cleanupPathsAsync(paths, nil, "duplicates", permanent)
}

func cloneKeepers(in map[string]string) map[string]string {
	if len(in) == 0 {
		return map[string]string{}
	}
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
