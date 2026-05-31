package app

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/micromdm/plist"

	"mac-cleaner/internal/model"
)

var appSearchPaths = []string{
	"/Applications",
	"/System/Applications",
}

func ListInstalledApps() ([]model.InstalledApp, error) {
	return ScanInstalledApps(context.Background(), nil)
}

func appSearchRoots() ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	return append([]string{filepath.Join(home, "Applications")}, appSearchPaths...), nil
}

func ScanInstalledApps(ctx context.Context, onProgress func(model.ScanProgress)) ([]model.InstalledApp, error) {
	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}

	roots, err := appSearchRoots()
	if err != nil {
		return nil, err
	}

	type candidate struct {
		path string
		root string
	}
	var candidates []candidate
	for _, root := range roots {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		if _, err := os.Stat(root); err != nil {
			continue
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() || !strings.HasSuffix(entry.Name(), ".app") {
				continue
			}
			candidates = append(candidates, candidate{
				path: filepath.Join(root, entry.Name()),
				root: root,
			})
		}
	}

	total := int64(len(candidates))
	if total == 0 {
		total = 1
	}

	emit(model.ScanProgress{
		Phase:   "starting",
		Total:   total,
		Percent: 0,
		Message: "Scanning for installed applications...",
	})

	seen := map[string]struct{}{}
	var apps []model.InstalledApp
	var step int64

	for _, c := range candidates {
		select {
		case <-ctx.Done():
			return apps, ctx.Err()
		default:
		}
		if _, ok := seen[c.path]; ok {
			step++
			continue
		}
		seen[c.path] = struct{}{}

		app, err := parseAppBundle(c.path)
		if err != nil {
			step++
			continue
		}
		apps = append(apps, app)
		step++

		emit(model.ScanProgress{
			Phase:       "scanning",
			CurrentPath: c.path,
			Scanned:     step,
			Total:       total,
			Percent:     float64(step) / float64(total) * 100,
			Message:     fmt.Sprintf("Found %s...", app.Name),
		})
	}

	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: int64(len(apps)),
		Total:   total,
		Percent: 100,
		Message: fmt.Sprintf("Found %d applications", len(apps)),
	})

	return apps, nil
}

func parseAppBundle(appPath string) (model.InstalledApp, error) {
	plistPath := filepath.Join(appPath, "Contents", "Info.plist")
	data, err := os.ReadFile(plistPath)
	if err != nil {
		return model.InstalledApp{}, err
	}

	var info map[string]any
	if err := plist.Unmarshal(data, &info); err != nil {
		return model.InstalledApp{}, err
	}

	name := stringVal(info, "CFBundleName")
	if name == "" {
		name = stringVal(info, "CFBundleDisplayName")
	}
	if name == "" {
		name = filepath.Base(strings.TrimSuffix(appPath, ".app"))
	}

	bundleID := stringVal(info, "CFBundleIdentifier")
	version := stringVal(info, "CFBundleShortVersionString")
	if version == "" {
		version = stringVal(info, "CFBundleVersion")
	}

	size, _ := dirSize(appPath)
	systemApp := strings.HasPrefix(appPath, "/System/Applications")

	return model.InstalledApp{
		Name:      name,
		BundleID:  bundleID,
		Path:      appPath,
		Version:   version,
		SizeBytes: size,
		SystemApp: systemApp,
	}, nil
}

func stringVal(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprintf("%v", t)
	}
}

func dirSize(root string) (int64, error) {
	var total int64
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total, err
}

func ScanLeftovers(ctx context.Context, app model.InstalledApp, onProgress func(model.ScanProgress)) ([]model.LeftoverFile, error) {
	emit := func(p model.ScanProgress) {
		if onProgress != nil {
			onProgress(p)
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	type target struct {
		path string
		kind string
	}

	targets := []target{
		{filepath.Join(home, "Library", "Application Support", app.Name), "application_support"},
		{filepath.Join(home, "Library", "Preferences", app.BundleID+".plist"), "preferences"},
		{filepath.Join(home, "Library", "Caches", app.BundleID), "cache"},
		{filepath.Join(home, "Library", "Logs", app.Name), "logs"},
		{filepath.Join(home, "Library", "Containers", app.BundleID), "container"},
		{filepath.Join(home, "Library", "Saved Application State", app.BundleID+".savedState"), "saved_state"},
		{filepath.Join(home, "Library", "WebKit", app.BundleID), "webkit"},
		{filepath.Join(home, "Library", "HTTPStorages", app.BundleID), "http_storage"},
		{filepath.Join(home, "Library", "Cookies", app.BundleID+".binarycookies"), "cookies"},
	}

	if app.BundleID != "" {
		prefsGlob := filepath.Join(home, "Library", "Preferences", app.BundleID)
		if entries, err := filepath.Glob(prefsGlob + "*"); err == nil {
			for _, p := range entries {
				targets = append(targets, target{p, "preferences"})
			}
		}
	}

	totalSteps := int64(len(targets) + 1)
	emit(model.ScanProgress{
		Phase:   "starting",
		Total:   totalSteps,
		Percent: 0,
		Message: fmt.Sprintf("Scanning leftovers for %s...", app.Name),
	})

	var files []model.LeftoverFile
	seen := map[string]struct{}{}
	var step int64

	for _, t := range targets {
		select {
		case <-ctx.Done():
			return files, ctx.Err()
		default:
		}
		if t.path == "" || strings.Contains(t.path, "//") {
			continue
		}
		st, err := os.Stat(t.path)
		if err != nil {
			step++
			continue
		}
		if _, ok := seen[t.path]; ok {
			step++
			continue
		}
		seen[t.path] = struct{}{}

		if st.IsDir() {
			size, _ := dirSize(t.path)
			files = append(files, model.LeftoverFile{Path: t.path, SizeBytes: size, Kind: t.kind})
		} else {
			files = append(files, model.LeftoverFile{Path: t.path, SizeBytes: st.Size(), Kind: t.kind})
		}

		step++
		emit(model.ScanProgress{
			Phase:       "scanning",
			CurrentPath: t.path,
			Scanned:     step,
			Total:       totalSteps,
			Percent:     float64(step) / float64(totalSteps) * 100,
			Message:     fmt.Sprintf("Checking %s...", filepath.Base(t.path)),
		})
	}

	select {
	case <-ctx.Done():
		return files, ctx.Err()
	default:
	}

	agentDir := filepath.Join(home, "Library", "LaunchAgents")
	if entries, err := os.ReadDir(agentDir); err == nil {
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".plist") {
				continue
			}
			p := filepath.Join(agentDir, e.Name())
			data, err := os.ReadFile(p)
			if err != nil {
				continue
			}
			content := string(data)
			if strings.Contains(content, app.BundleID) || strings.Contains(content, app.Name) {
				if st, err := os.Stat(p); err == nil {
					files = append(files, model.LeftoverFile{Path: p, SizeBytes: st.Size(), Kind: "launch_agent"})
				}
			}
		}
	}

	step++
	emit(model.ScanProgress{
		Phase:   "done",
		Scanned: step,
		Total:   totalSteps,
		Percent: 100,
		Message: fmt.Sprintf("Found %d leftover items", len(files)),
	})

	return files, nil
}

func FindAppByPath(apps []model.InstalledApp, appPath string) (*model.InstalledApp, error) {
	for i := range apps {
		if apps[i].Path == appPath {
			return &apps[i], nil
		}
	}
	app, err := parseAppBundle(appPath)
	if err != nil {
		return nil, fmt.Errorf("app not found: %s", appPath)
	}
	return &app, nil
}
