package launchd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func UnloadAgent(plistPath string) error {
	if !strings.HasSuffix(plistPath, ".plist") {
		return fmt.Errorf("not a plist: %s", plistPath)
	}
	uid := os.Getuid()
	label := strings.TrimSuffix(filepath.Base(plistPath), ".plist")

	// Try bootout (modern launchctl)
	target := fmt.Sprintf("gui/%d/%s", uid, label)
	_ = exec.Command("launchctl", "bootout", target, plistPath).Run()

	// Fallback unload
	_ = exec.Command("launchctl", "unload", plistPath).Run()
	return nil
}

func UnloadAgents(paths []string) []error {
	var errs []error
	for _, p := range paths {
		if err := UnloadAgent(p); err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}
