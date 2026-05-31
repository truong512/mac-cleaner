package app

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Quit asks a running application to quit before uninstalling its bundle.
func Quit(bundleID string) error {
	bundleID = strings.TrimSpace(bundleID)
	if bundleID == "" {
		return nil
	}
	script := fmt.Sprintf(`tell application id %q to quit`, bundleID)
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		// App may not be running — not an uninstall blocker.
		if strings.Contains(strings.ToLower(string(out)), "not running") {
			return nil
		}
		return fmt.Errorf("quit %s: %w (%s)", bundleID, err, strings.TrimSpace(string(out)))
	}
	time.Sleep(400 * time.Millisecond)
	return nil
}
