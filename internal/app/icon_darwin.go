//go:build darwin

package app

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/micromdm/plist"
)

const appIconSize = 64

func AppIconDataURL(appPath string) (string, error) {
	iconPath, err := resolveAppIconPath(appPath)
	if err != nil {
		return "", err
	}
	png, err := iconToPNG(iconPath, appIconSize)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}

func resolveAppIconPath(appPath string) (string, error) {
	plistPath := filepath.Join(appPath, "Contents", "Info.plist")
	data, err := os.ReadFile(plistPath)
	if err != nil {
		return "", err
	}
	var info map[string]any
	if err := plist.Unmarshal(data, &info); err != nil {
		return "", err
	}

	resources := filepath.Join(appPath, "Contents", "Resources")
	for _, name := range bundleIconNames(info) {
		if path := findIconInResources(resources, name); path != "" {
			return path, nil
		}
	}
	for _, fallback := range []string{"AppIcon.icns", "application.icns", "AppIcon.png"} {
		path := filepath.Join(resources, fallback)
		if fileExists(path) {
			return path, nil
		}
	}
	return "", fmt.Errorf("no icon in %s", appPath)
}

func bundleIconNames(info map[string]any) []string {
	seen := make(map[string]struct{})
	var names []string
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		name = strings.TrimSuffix(name, ".icns")
		name = strings.TrimSuffix(name, ".png")
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}

	add(stringVal(info, "CFBundleIconFile"))

	if icons, ok := info["CFBundleIcons"].(map[string]any); ok {
		if primary, ok := icons["CFBundlePrimaryIcon"].(map[string]any); ok {
			appendIconFiles(add, primary["CFBundleIconFiles"])
			add(stringVal(primary, "CFBundleIconName"))
		}
	}
	appendIconFiles(add, info["CFBundleIconFiles"])

	return names
}

func appendIconFiles(add func(string), raw any) {
	switch v := raw.(type) {
	case string:
		add(v)
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				add(s)
			}
		}
	}
}

func findIconInResources(resources, name string) string {
	candidates := []string{
		filepath.Join(resources, name+".icns"),
		filepath.Join(resources, name+".png"),
		filepath.Join(resources, name),
	}
	for _, path := range candidates {
		if fileExists(path) {
			return path
		}
	}
	return ""
}

func fileExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

func iconToPNG(iconPath string, size int) ([]byte, error) {
	tmp, err := os.CreateTemp("", "mac-cleaner-icon-*.png")
	if err != nil {
		return nil, err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()
	defer os.Remove(tmpPath)

	sizeArg := fmt.Sprintf("%d", size)
	out, err := exec.Command(
		"sips",
		"-s", "format", "png",
		"-z", sizeArg, sizeArg,
		iconPath,
		"--out", tmpPath,
	).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("sips: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return os.ReadFile(tmpPath)
}
