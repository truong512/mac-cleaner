package timemachine

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"mac-cleaner/internal/model"
)

var snapshotLine = regexp.MustCompile(`^com\.apple\.TimeMachine\.(\d{4}-\d{2}-\d{2}-\d{6})\.local$`)

// ParseListOutput parses lines from `tmutil listlocalsnapshots`.
func ParseListOutput(mount, output string) []model.LocalSnapshot {
	var out []model.LocalSnapshot
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Snapshots for") {
			continue
		}
		name := line
		if idx := strings.LastIndex(line, " "); idx >= 0 {
			name = strings.TrimSpace(line[idx+1:])
		}
		snap := model.LocalSnapshot{Name: name, Mount: mount}
		if m := snapshotLine.FindStringSubmatch(name); len(m) == 2 {
			snap.Date = formatSnapshotDate(m[1])
		}
		out = append(out, snap)
	}
	return out
}

func formatSnapshotDate(raw string) string {
	// 2024-01-15-120000
	if len(raw) < 17 {
		return raw
	}
	t, err := time.Parse("2006-01-02-150405", raw)
	if err != nil {
		return raw
	}
	return t.Format(time.RFC3339)
}

func ListLocalSnapshots(mount string) ([]model.LocalSnapshot, error) {
	if mount == "" {
		mount = "/"
	}
	cmd := exec.Command("tmutil", "listlocalsnapshots", mount)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("tmutil listlocalsnapshots: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return ParseListOutput(mount, string(out)), nil
}

// DeleteLocalSnapshot removes one local APFS snapshot by name.
func DeleteLocalSnapshot(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("empty snapshot name")
	}
	// tmutil deletelocalsnapshots <date> where date is YYYY-MM-DD-HHMMSS
	date := snapshotDateFromName(name)
	if date == "" {
		return fmt.Errorf("cannot parse snapshot date from %q", name)
	}
	cmd := exec.Command("tmutil", "deletelocalsnapshots", date)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tmutil deletelocalsnapshots: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func snapshotDateFromName(name string) string {
	if m := snapshotLine.FindStringSubmatch(name); len(m) == 2 {
		return m[1]
	}
	return ""
}
