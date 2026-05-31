package delete

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMoveToTrashAppBundle(t *testing.T) {
	tmp := t.TempDir()
	appRoot := filepath.Join(tmp, "Sample.app")
	if err := os.MkdirAll(filepath.Join(appRoot, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.example.sample</string>
<key>CFBundleName</key><string>Sample</string>
</dict></plist>`
	if err := os.WriteFile(filepath.Join(appRoot, "Contents", "Info.plist"), []byte(plist), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := MoveToTrash(appRoot); err != nil {
		t.Fatalf("MoveToTrash(.app): %v", err)
	}
	if _, err := os.Lstat(appRoot); !os.IsNotExist(err) {
		t.Fatalf("app bundle should be removed from original path, stat err=%v", err)
	}
}
