package catalog

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bmatcuk/doublestar/v4"
	"gopkg.in/yaml.v3"

	"mac-cleaner/internal/model"
)

//go:embed catalog.yaml
var catalogFS embed.FS

type Rule struct {
	Glob       string   `yaml:"glob"`
	MinAgeDays int      `yaml:"min_age_days"`
	Exclude    []string `yaml:"exclude"`
}

type Category struct {
	ID          string   `yaml:"id"`
	Label       string   `yaml:"label"`
	Risk        string   `yaml:"risk"`
	Paths       []string `yaml:"paths"`
	Rules       []Rule   `yaml:"rules"`
	Desc        string   `yaml:"description"`
	Tags        []string `yaml:"tags,omitempty"`
	RequiresFDA bool     `yaml:"requires_fda,omitempty"`
}

type Catalog struct {
	Categories []Category `yaml:"categories"`
}

var sipDenylist = []string{
	"/System",
	"/usr",
	"/bin",
	"/sbin",
	"/private/var/db",
}

func Load() (*Catalog, error) {
	path, err := UserCatalogPath()
	if err != nil {
		return loadEmbedded()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return loadEmbedded()
		}
		return nil, err
	}
	return Parse(data)
}

func loadEmbedded() (*Catalog, error) {
	data, err := catalogFS.ReadFile("catalog.yaml")
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

// Parse unmarshals and validates catalog YAML.
func Parse(data []byte) (*Catalog, error) {
	var c Catalog
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse catalog: %w", err)
	}
	if err := validate(&c); err != nil {
		return nil, err
	}
	return &c, nil
}

func validate(c *Catalog) error {
	if c == nil || len(c.Categories) == 0 {
		return fmt.Errorf("catalog must define at least one category")
	}
	seen := make(map[string]struct{}, len(c.Categories))
	for i, cat := range c.Categories {
		if strings.TrimSpace(cat.ID) == "" {
			return fmt.Errorf("category %d: missing id", i)
		}
		if _, dup := seen[cat.ID]; dup {
			return fmt.Errorf("duplicate category id %q", cat.ID)
		}
		seen[cat.ID] = struct{}{}
		if strings.TrimSpace(cat.Label) == "" {
			return fmt.Errorf("category %q: missing label", cat.ID)
		}
		if strings.TrimSpace(cat.Risk) == "" {
			return fmt.Errorf("category %q: missing risk", cat.ID)
		}
		if len(cat.Paths) == 0 {
			return fmt.Errorf("category %q: missing paths", cat.ID)
		}
	}
	return nil
}

func (c *Catalog) CategoriesMeta() []model.CategorySummary {
	out := make([]model.CategorySummary, 0, len(c.Categories))
	for _, cat := range c.Categories {
		out = append(out, model.CategorySummary{
			ID:          cat.ID,
			Label:       cat.Label,
			Risk:        model.Risk(cat.Risk),
			Tags:        cat.effectiveTags(),
			RequiresFDA: cat.RequiresFDA,
		})
	}
	return out
}

func (cat *Category) effectiveTags() []string {
	if len(cat.Tags) > 0 {
		return append([]string(nil), cat.Tags...)
	}
	return inferTags(cat.ID)
}

func inferTags(id string) []string {
	switch {
	case strings.HasPrefix(id, "xcode_") || strings.HasPrefix(id, "simulator") ||
		id == "homebrew_cache" || id == "npm_cache" || id == "yarn_cache" || id == "pip_cache" ||
		id == "go_build_cache" || id == "gradle_cache" || id == "cargo_cache" || id == "pnpm_cache" ||
		id == "bun_cache" || id == "composer_cache" || id == "cocoa_pods_cache" ||
		id == "android_studio_cache" || id == "jetbrains_cache" || id == "docker_cache" || id == "docker_desktop_logs":
		return []string{"developer"}
	case id == "chrome_cache" || id == "firefox_cache" || id == "edge_cache" ||
		id == "brave_cache" || id == "arc_cache" || id == "safari_cache":
		return []string{"browser"}
	case id == "mail_downloads" || id == "mail_app_cache":
		return []string{"mail", "apple"}
	case id == "photos_analysis_cache" || id == "photos_thumbnails":
		return []string{"photos", "apple"}
	case id == "ios_backups" || id == "software_update_cache" || id == "quicklook_cache" ||
		id == "help_cache" || id == "system_logs":
		return []string{"apple"}
	case id == "user_caches" || id == "user_logs" || id == "temp_files" ||
		id == "downloads_incomplete" || id == "trash_metadata" || id == "user_saved_state":
		return []string{"apple"}
	default:
		return nil
	}
}

// CategoryIDsByTags returns category IDs that match any of the given tags.
func (c *Catalog) CategoryIDsByTags(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	want := make(map[string]struct{}, len(tags))
	for _, t := range tags {
		want[strings.ToLower(strings.TrimSpace(t))] = struct{}{}
	}
	var ids []string
	for _, cat := range c.Categories {
		for _, tag := range cat.effectiveTags() {
			if _, ok := want[strings.ToLower(tag)]; ok {
				ids = append(ids, cat.ID)
				break
			}
		}
	}
	return ids
}

func ExpandPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", nil
	}
	if strings.HasPrefix(p, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if p == "~" {
			return home, nil
		}
		if strings.HasPrefix(p, "~/") {
			return filepath.Join(home, p[2:]), nil
		}
	}
	return p, nil
}

func IsProtected(path string) bool {
	clean := filepath.Clean(path)
	for _, prefix := range sipDenylist {
		if clean == prefix || strings.HasPrefix(clean, prefix+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func (c *Catalog) MatchCategory(path string, info os.FileInfo) (*Category, bool) {
	if info.IsDir() {
		return nil, false
	}
	for i := range c.Categories {
		cat := &c.Categories[i]
		for _, root := range cat.Paths {
			expanded, err := ExpandPath(root)
			if err != nil {
				continue
			}
			if !strings.HasPrefix(path, expanded) {
				continue
			}
			rel, err := filepath.Rel(expanded, path)
			if err != nil {
				continue
			}
			for _, rule := range cat.Rules {
				glob := rule.Glob
				if glob == "" {
					glob = "**/*"
				}
				matched, _ := doublestar.PathMatch(glob, rel)
				if !matched {
					continue
				}
				excluded := false
				for _, ex := range rule.Exclude {
					if ok, _ := doublestar.PathMatch(ex, rel); ok {
						excluded = true
						break
					}
					if ok, _ := doublestar.Match(ex, filepath.Base(path)); ok {
						excluded = true
						break
					}
				}
				if excluded {
					continue
				}
				if rule.MinAgeDays > 0 {
					age := time.Since(info.ModTime())
					if age < time.Duration(rule.MinAgeDays)*24*time.Hour {
						continue
					}
				}
				return cat, true
			}
		}
	}
	return nil, false
}

func CategoryToScanItem(cat *Category, path string, size int64) model.ScanItem {
	desc := cat.Desc
	if desc == "" {
		desc = cat.Label
	}
	return model.ScanItem{
		ID:          fmt.Sprintf("%s:%s", cat.ID, path),
		Path:        path,
		Category:    cat.ID,
		CategoryLbl: cat.Label,
		SizeBytes:   size,
		Risk:        model.Risk(cat.Risk),
		Description: desc,
		Selected:    model.Risk(cat.Risk) == model.RiskSafe,
	}
}
