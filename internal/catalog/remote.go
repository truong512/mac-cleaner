package catalog

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DefaultCatalogRawURL is the catalog.yaml on the project's default branch (GitHub raw).
const DefaultCatalogRawURL = "https://raw.githubusercontent.com/truong512/mac-cleaner/main/internal/catalog/catalog.yaml"

func userCatalogDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "Application Support", "mac-cleaner"), nil
}

// UserCatalogPath is where a downloaded or custom catalog.yaml is stored.
func UserCatalogPath() (string, error) {
	dir, err := userCatalogDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "catalog.yaml"), nil
}

// CatalogSource indicates which catalog file is active.
type CatalogSource string

const (
	SourceEmbedded CatalogSource = "embedded"
	SourceCustom   CatalogSource = "custom"
)

// Info describes the active junk scan definition catalog.
type Info struct {
	Source        CatalogSource `json:"source"`
	Path          string        `json:"path,omitempty"`
	CategoryCount int           `json:"categoryCount"`
	UpdatedAt     string        `json:"updatedAt,omitempty"`
	DefaultURL    string        `json:"defaultUrl"`
}

func GetInfo(cat *Catalog) (Info, error) {
	if cat == nil {
		return Info{}, fmt.Errorf("catalog is nil")
	}
	info := Info{
		Source:        SourceEmbedded,
		CategoryCount: len(cat.Categories),
		DefaultURL:    DefaultCatalogRawURL,
	}
	path, err := UserCatalogPath()
	if err != nil {
		return info, err
	}
	if st, err := os.Stat(path); err == nil {
		info.Source = SourceCustom
		info.Path = path
		info.UpdatedAt = st.ModTime().UTC().Format(time.RFC3339)
	}
	return info, nil
}

// DownloadFromURL fetches catalog YAML, validates it, and saves it to UserCatalogPath.
func DownloadFromURL(ctx context.Context, rawURL string) (*Catalog, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		rawURL = DefaultCatalogRawURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download catalog: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download catalog: HTTP %d", resp.StatusCode)
	}
	const maxSize = 4 << 20 // 4 MiB
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxSize+1))
	if err != nil {
		return nil, fmt.Errorf("read catalog: %w", err)
	}
	if len(data) > maxSize {
		return nil, fmt.Errorf("catalog file too large")
	}
	cat, err := Parse(data)
	if err != nil {
		return nil, err
	}
	path, err := UserCatalogPath()
	if err != nil {
		return nil, err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return nil, err
	}
	return cat, nil
}

// RemoveUserCatalog deletes the downloaded catalog so Load() uses the embedded definition.
func RemoveUserCatalog() error {
	path, err := UserCatalogPath()
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
