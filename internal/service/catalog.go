package service

import (
	"context"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
	"mac-cleaner/internal/scan"
)

func (s *Service) GetCatalogInfo() (model.CatalogInfo, error) {
	info, err := catalog.GetInfo(s.catalog)
	if err != nil {
		return model.CatalogInfo{}, err
	}
	return model.CatalogInfo{
		Source:        string(info.Source),
		Path:          info.Path,
		CategoryCount: info.CategoryCount,
		UpdatedAt:     info.UpdatedAt,
		DefaultURL:    info.DefaultURL,
	}, nil
}

func (s *Service) DownloadCatalogFromGit(url string) error {
	ctx := s.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	cat, err := catalog.DownloadFromURL(ctx, url)
	if err != nil {
		return err
	}
	s.setCatalog(cat)
	return nil
}

func (s *Service) ResetCatalog() error {
	if err := catalog.RemoveUserCatalog(); err != nil {
		return err
	}
	cat, err := catalog.Load()
	if err != nil {
		return err
	}
	s.setCatalog(cat)
	return nil
}

func (s *Service) setCatalog(cat *catalog.Catalog) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.catalog = cat
	s.scanEng = scan.NewEngine(cat)
	s.lastJunkItems = nil
	s.junkSel = junkSelectionCache{}
}
