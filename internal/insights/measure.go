package insights

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type measureResult struct {
	Bytes    int64
	Exists   bool
	Readable bool
}

func measurePath(path string) measureResult {
	path = filepath.Clean(path)
	st, err := os.Stat(path)
	if err != nil {
		return measureResult{}
	}
	if !st.IsDir() {
		return measureResult{Bytes: st.Size(), Exists: true, Readable: true}
	}

	var total int64
	var files int
	_ = filepath.WalkDir(path, func(_ string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		files++
		total += info.Size()
		return nil
	})
	if files > 0 {
		return measureResult{Bytes: total, Exists: true, Readable: true}
	}

	if kb, ok := duKilobytes(path); ok {
		return measureResult{Bytes: kb * 1024, Exists: true, Readable: true}
	}

	return measureResult{Exists: true, Readable: false}
}

func duKilobytes(path string) (int64, bool) {
	out, err := exec.Command("du", "-sk", path).Output()
	if err != nil {
		return 0, false
	}
	fields := bytes.Fields(out)
	if len(fields) < 1 {
		return 0, false
	}
	kb, err := strconv.ParseInt(strings.TrimSpace(string(fields[0])), 10, 64)
	if err != nil || kb < 0 {
		return 0, false
	}
	return kb, true
}
