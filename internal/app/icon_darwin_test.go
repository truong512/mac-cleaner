//go:build darwin

package app

import (
	"strings"
	"testing"
)

func TestResolveAppIconPath_knownApp(t *testing.T) {
	candidates := []string{
		"/System/Applications/Calculator.app",
		"/Applications/Safari.app",
	}
	var tested bool
	for _, appPath := range candidates {
		if !fileExists(appPath) {
			continue
		}
		tested = true
		path, err := resolveAppIconPath(appPath)
		if err != nil {
			t.Fatalf("resolveAppIconPath(%q): %v", appPath, err)
		}
		if path == "" || !fileExists(path) {
			t.Fatalf("unexpected icon path %q for %q", path, appPath)
		}
		url, err := AppIconDataURL(appPath)
		if err != nil {
			t.Fatalf("AppIconDataURL(%q): %v", appPath, err)
		}
		if !strings.HasPrefix(url, "data:image/png;base64,") {
			t.Fatalf("expected data URL, got prefix %q", url[:min(32, len(url))])
		}
		break
	}
	if !tested {
		t.Skip("no sample .app bundles found")
	}
}
