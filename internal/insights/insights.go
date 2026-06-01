package insights

import (
	"os"
	"path/filepath"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/model"
)

func GetStorageInsights(cat *catalog.Catalog) []model.StorageInsight {
	home, _ := os.UserHomeDir()
	return []model.StorageInsight{
		taggedCacheInsight(cat, home, []string{"photos"}, insightMeta{
			ID:          "photos_caches",
			Label:       "Photos Caches",
			Description: "Removable Photos app caches (not your Photos library originals)",
			Preset:      "photos",
			NeedsFDA:    true,
		}),
		taggedCacheInsight(cat, home, []string{"mail"}, insightMeta{
			ID:          "mail_caches",
			Label:       "Mail Caches",
			Description: "Mail attachment downloads and app caches (not mailbox data)",
			Preset:      "mail",
			NeedsFDA:    true,
		}),
		developerInsight(cat),
		photosLibraryInsight(home),
	}
}

type insightMeta struct {
	ID          string
	Label       string
	Description string
	Preset      string
	NeedsFDA    bool
}

func taggedCacheInsight(cat *catalog.Catalog, home string, tags []string, meta insightMeta) model.StorageInsight {
	var total int64
	var exists bool
	var readable bool
	seen := map[string]struct{}{}

	for _, id := range cat.CategoryIDsByTags(tags) {
		for _, c := range cat.Categories {
			if c.ID != id {
				continue
			}
			for _, p := range c.Paths {
				expanded, err := catalog.ExpandPath(p)
				if err != nil || expanded == "" {
					continue
				}
				if _, dup := seen[expanded]; dup {
					continue
				}
				seen[expanded] = struct{}{}
				r := measurePath(expanded)
				if r.Exists {
					exists = true
				}
				if r.Readable {
					readable = true
					total += r.Bytes
				}
			}
		}
	}

	desc := meta.Description
	if exists && !readable && meta.NeedsFDA {
		desc = meta.Description + " Grant Full Disk Access to measure sandboxed folders."
	}

	return model.StorageInsight{
		ID:          meta.ID,
		Label:       meta.Label,
		SizeBytes:   total,
		Available:   readable,
		Description: desc,
		Preset:      meta.Preset,
	}
}

func photosLibraryInsight(home string) model.StorageInsight {
	path := filepath.Join(home, "Pictures", "Photos Library.photoslibrary")
	r := measurePath(path)
	desc := "Total size of your Photos library package (read-only)"
	if r.Exists && !r.Readable {
		desc += " Grant Full Disk Access to measure."
	}
	return model.StorageInsight{
		ID:          "photos_library",
		Label:       "Photos Library",
		SizeBytes:   r.Bytes,
		Available:   r.Readable,
		Description: desc + " Not removable here — use Photos Caches in Smart Scan for safe cleanup.",
		Preset:      "",
	}
}

func developerInsight(cat *catalog.Catalog) model.StorageInsight {
	var total int64
	var exists bool
	var readable bool
	seen := map[string]struct{}{}
	for _, id := range cat.CategoryIDsByTags([]string{"developer"}) {
		for _, c := range cat.Categories {
			if c.ID != id {
				continue
			}
			for _, p := range c.Paths {
				expanded, err := catalog.ExpandPath(p)
				if err != nil {
					continue
				}
				if _, ok := seen[expanded]; ok {
					continue
				}
				seen[expanded] = struct{}{}
				r := measurePath(expanded)
				if r.Exists {
					exists = true
				}
				if r.Readable {
					readable = true
					total += r.Bytes
				}
			}
		}
	}
	_ = exists
	return model.StorageInsight{
		ID:          "developer_footprint",
		Label:       "Developer Caches",
		SizeBytes:   total,
		Available:   readable,
		Description: "Combined size of developer tool cache roots",
		Preset:      "developer",
	}
}
