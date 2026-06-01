package settings_test

import (
	"os"
	"path/filepath"
	"testing"

	"mac-cleaner/internal/model"
	"mac-cleaner/internal/settings"
)

func TestSaveLoadRoundtrip(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	s := model.AppSettings{
		DryRunDefault:    false,
		ExcludeGlobs:     []string{"**/.git/**"},
		BigFilesMinBytes: 100,
	}
	if err := settings.Save(s); err != nil {
		t.Fatal(err)
	}
	got, err := settings.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.DryRunDefault != s.DryRunDefault {
		t.Fatalf("DryRunDefault = %v, want %v", got.DryRunDefault, s.DryRunDefault)
	}
	if len(got.ExcludeGlobs) != 1 || got.ExcludeGlobs[0] != "**/.git/**" {
		t.Fatalf("ExcludeGlobs = %v", got.ExcludeGlobs)
	}
	if got.BigFilesMinBytes != 100 {
		t.Fatalf("BigFilesMinBytes = %d", got.BigFilesMinBytes)
	}

	path := filepath.Join(home, "Library", "Application Support", "mac-cleaner", "settings.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("settings file missing: %v", err)
	}
}

func TestLoadMissingUsesDefaults(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	got, err := settings.Load()
	if err != nil {
		t.Fatal(err)
	}
	def := settings.Default()
	if got.DryRunDefault != def.DryRunDefault {
		t.Fatalf("DryRunDefault = %v, want %v", got.DryRunDefault, def.DryRunDefault)
	}
}
