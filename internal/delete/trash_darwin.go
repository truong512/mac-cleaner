//go:build darwin

package delete

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	go2trash "github.com/rafshawn/go2trash"
)

func moveToTrashOS(path string) error {
	abs, err := resolveTrashPath(path)
	if err != nil {
		return err
	}

	var errs []string
	if err := go2trash.MoveToTrash(abs); err == nil {
		return nil
	} else if err != nil {
		errs = append(errs, err.Error())
	}

	if err := trashViaFinder(abs); err == nil {
		return nil
	} else if err != nil {
		errs = append(errs, err.Error())
	}

	if err := moveToUserTrash(abs); err == nil {
		return nil
	} else if err != nil {
		errs = append(errs, err.Error())
	}

	return fmt.Errorf("cannot move to Trash: %s", strings.Join(errs, "; "))
}

func resolveTrashPath(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("empty path")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	if _, err := os.Lstat(abs); err != nil {
		return "", err
	}
	return abs, nil
}

func trashViaFinder(absPath string) error {
	script := fmt.Sprintf(`tell application "Finder" to delete POSIX file %q`, absPath)
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("Finder: %s", msg)
	}
	// Finder delete is asynchronous; brief wait for the item to leave its original path.
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Lstat(absPath); os.IsNotExist(err) {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("Finder: item still present after delete")
}

func moveToUserTrash(absPath string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	trashDir := filepath.Join(home, ".Trash")
	if err := os.MkdirAll(trashDir, 0o755); err != nil {
		return err
	}
	base := filepath.Base(absPath)
	dest := filepath.Join(trashDir, base)
	for i := 1; i < 1000; i++ {
		if _, err := os.Lstat(dest); os.IsNotExist(err) {
			break
		}
		dest = filepath.Join(trashDir, fmt.Sprintf("%s %d", base, i))
	}
	if err := os.Rename(absPath, dest); err != nil {
		return fmt.Errorf("rename to Trash: %w", err)
	}
	return nil
}
