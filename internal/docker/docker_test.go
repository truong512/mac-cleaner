package docker_test

import (
	"testing"

	"mac-cleaner/internal/docker"
)

func TestParseDFOutput(t *testing.T) {
	output := `{"Type":"Images","TotalCount":5,"Active":2,"Size":"1.2GB","Reclaimable":"500MB","ReclaimableSize":"500MB"}
{"Type":"Containers","TotalCount":3,"Active":1,"Size":"100MB","Reclaimable":"50MB","ReclaimableSize":"50MB"}
`
	rows, err := docker.ParseDFOutput(output)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows", len(rows))
	}
	if rows[0].Type != "Images" {
		t.Fatalf("type = %q", rows[0].Type)
	}
	if rows[0].Reclaimable <= 0 {
		t.Fatalf("reclaimable = %d", rows[0].Reclaimable)
	}
}
