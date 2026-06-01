package settings

import (
	"encoding/json"
	"os"
	"path/filepath"

	"mac-cleaner/internal/bigfiles"
	"mac-cleaner/internal/model"
)

func dirPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "Application Support", "mac-cleaner"), nil
}

func filePath() (string, error) {
	dir, err := dirPath()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

func Default() model.AppSettings {
	return model.AppSettings{
		DryRunDefault:    true,
		ExcludeGlobs:     []string{},
		BigFilesMinBytes: bigfiles.DefaultMinSizeBytes,
	}
}

func Load() (model.AppSettings, error) {
	def := Default()
	path, err := filePath()
	if err != nil {
		return def, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return def, nil
		}
		return def, err
	}
	var s model.AppSettings
	if err := json.Unmarshal(data, &s); err != nil {
		return def, err
	}
	if s.BigFilesMinBytes <= 0 {
		s.BigFilesMinBytes = def.BigFilesMinBytes
	}
	if s.ExcludeGlobs == nil {
		s.ExcludeGlobs = []string{}
	}
	return s, nil
}

func Save(settings model.AppSettings) error {
	dir, err := dirPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path, err := filePath()
	if err != nil {
		return err
	}
	if settings.ExcludeGlobs == nil {
		settings.ExcludeGlobs = []string{}
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
