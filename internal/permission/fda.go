package permission

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"mac-cleaner/internal/model"
)

const fdaSettingsURL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"

func Status() model.PermissionStatus {
	home, _ := os.UserHomeDir()
	status := model.PermissionStatus{
		FullDiskAccess: "unknown",
		HomeDir:        home,
	}
	if runtime.GOOS != "darwin" {
		status.FullDiskAccess = "unsupported"
		return status
	}
	if probeFullDiskAccess(home) {
		status.FullDiskAccess = "granted"
	} else {
		status.FullDiskAccess = "denied"
	}
	return status
}

func probeFullDiskAccess(home string) bool {
	probes := []string{
		filepath.Join(home, "Library", "Safari", "Bookmarks.plist"),
		filepath.Join(home, "Library", "Containers", "com.apple.stocks"),
		filepath.Join(home, "Library", "Mail"),
	}
	ok := 0
	for _, p := range probes {
		if _, err := os.Stat(p); err == nil {
			f, err := os.Open(p)
			if err == nil {
				_ = f.Close()
				ok++
			}
		}
	}
	return ok >= 1
}

func OpenFullDiskAccessSettings() error {
	return exec.Command("open", fdaSettingsURL).Run()
}
