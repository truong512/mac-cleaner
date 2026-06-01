package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"mac-cleaner/internal/model"
)

type dfRow struct {
	Type            string `json:"Type"`
	TotalCount      int    `json:"TotalCount"`
	Active          int    `json:"Active"`
	Size            string `json:"Size"`
	Reclaimable     string `json:"Reclaimable"`
	ReclaimableSize string `json:"ReclaimableSize"`
}

func IsAvailable() bool {
	if _, err := exec.LookPath("docker"); err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", "info", "--format", "{{.ServerVersion}}")
	return cmd.Run() == nil
}

func DiskUsage() (model.DockerDiskUsage, error) {
	usage := model.DockerDiskUsage{Available: IsAvailable()}
	if !usage.Available {
		return usage, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", "system", "df", "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		usage.Error = strings.TrimSpace(err.Error())
		return usage, err
	}
	rows, err := ParseDFOutput(string(out))
	if err != nil {
		usage.Error = err.Error()
		return usage, err
	}
	usage.Rows = rows
	return usage, nil
}

func ParseDFOutput(output string) ([]model.DockerDiskRow, error) {
	var rows []model.DockerDiskRow
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var r dfRow
		if err := json.Unmarshal([]byte(line), &r); err != nil {
			return nil, fmt.Errorf("parse docker df line: %w", err)
		}
		rows = append(rows, model.DockerDiskRow{
			Type:        r.Type,
			Total:       parseSizeString(firstNonEmpty(r.Size, r.ReclaimableSize)),
			Active:      int64(r.Active),
			Reclaimable: parseSizeString(r.Reclaimable),
		})
	}
	return rows, nil
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// parseSizeString parses human sizes like "1.2GB" or "500MB" to bytes (approximate).
func parseSizeString(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" || s == "0B" {
		return 0
	}
	// Reclaimable may be "1.2GB (50%)"
	if idx := strings.Index(s, "("); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}
	var mult int64 = 1
	upper := strings.ToUpper(s)
	switch {
	case strings.HasSuffix(upper, "TB"):
		mult = 1024 * 1024 * 1024 * 1024
		s = s[:len(s)-2]
	case strings.HasSuffix(upper, "GB"):
		mult = 1024 * 1024 * 1024
		s = s[:len(s)-2]
	case strings.HasSuffix(upper, "MB"):
		mult = 1024 * 1024
		s = s[:len(s)-2]
	case strings.HasSuffix(upper, "KB"), strings.HasSuffix(upper, "KIB"):
		mult = 1024
		if strings.HasSuffix(upper, "KB") {
			s = s[:len(s)-2]
		} else {
			s = s[:len(s)-3]
		}
	case strings.HasSuffix(upper, "B"):
		mult = 1
		s = s[:len(s)-1]
	default:
		return 0
	}
	s = strings.TrimSpace(s)
	var val float64
	_, _ = fmt.Sscanf(s, "%f", &val)
	return int64(val * float64(mult))
}

func TotalReclaimable(rows []model.DockerDiskRow) int64 {
	var total int64
	for _, r := range rows {
		total += r.Reclaimable
	}
	return total
}

func ExecutePrune(ctx context.Context, opts model.DockerPruneOptions) (string, error) {
	if !IsAvailable() {
		return "", fmt.Errorf("docker is not available")
	}
	var parts []string
	args := []string{"system", "prune", "-f"}
	if opts.All {
		args = append(args, "-a")
	}
	if opts.Volumes {
		args = append(args, "--volumes")
	}
	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	parts = append(parts, "docker "+strings.Join(args, " ")+": "+strings.TrimSpace(string(out)))
	if err != nil {
		return strings.Join(parts, "\n"), fmt.Errorf("%w", err)
	}
	if opts.Builder {
		bcmd := exec.CommandContext(ctx, "docker", "builder", "prune", "-af")
		bout, berr := bcmd.CombinedOutput()
		parts = append(parts, "docker builder prune -af: "+strings.TrimSpace(string(bout)))
		if berr != nil {
			return strings.Join(parts, "\n"), fmt.Errorf("%w", berr)
		}
	}
	return strings.Join(parts, "\n"), nil
}
