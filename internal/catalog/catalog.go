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
	ID     string   `yaml:"id"`
	Label  string   `yaml:"label"`
	Risk   string   `yaml:"risk"`
	Paths  []string `yaml:"paths"`
	Rules  []Rule   `yaml:"rules"`
	Desc   string   `yaml:"description"`
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
	data, err := catalogFS.ReadFile("catalog.yaml")
	if err != nil {
		return nil, err
	}
	var c Catalog
	if err := yaml.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (c *Catalog) CategoriesMeta() []model.CategorySummary {
	out := make([]model.CategorySummary, 0, len(c.Categories))
	for _, cat := range c.Categories {
		out = append(out, model.CategorySummary{
			ID:    cat.ID,
			Label: cat.Label,
			Risk:  model.Risk(cat.Risk),
		})
	}
	return out
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
