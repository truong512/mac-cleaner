package timemachine_test

import (
	"testing"

	"mac-cleaner/internal/timemachine"
)

func TestParseListOutput(t *testing.T) {
	output := `Snapshots for disk /:
com.apple.TimeMachine.2024-06-15-120000.local
com.apple.TimeMachine.2024-07-01-080000.local
`
	snaps := timemachine.ParseListOutput("/", output)
	if len(snaps) != 2 {
		t.Fatalf("got %d snapshots, want 2", len(snaps))
	}
	if snaps[0].Name != "com.apple.TimeMachine.2024-06-15-120000.local" {
		t.Fatalf("name = %q", snaps[0].Name)
	}
	if snaps[0].Mount != "/" {
		t.Fatalf("mount = %q", snaps[0].Mount)
	}
	if snaps[0].Date == "" {
		t.Fatal("expected parsed date")
	}
}

func TestParseListOutputPlainLines(t *testing.T) {
	output := "com.apple.TimeMachine.2024-01-01-000000.local\n"
	snaps := timemachine.ParseListOutput("/", output)
	if len(snaps) != 1 {
		t.Fatalf("got %d", len(snaps))
	}
}
