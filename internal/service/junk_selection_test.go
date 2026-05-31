package service

import (
	"testing"

	"mac-cleaner/internal/model"
)

func TestJunkSelectionCacheIncremental(t *testing.T) {
	s := &Service{
		lastJunkItems: []model.ScanItem{
			{ID: "a", Path: "/tmp/a", Category: "caches", SizeBytes: 10, Selected: false},
			{ID: "b", Path: "/tmp/b", Category: "caches", SizeBytes: 20, Selected: false},
		},
	}
	s.rebuildJunkSelectionLocked()
	if s.junkSel.count != 0 {
		t.Fatalf("expected 0 selected, got %d", s.junkSel.count)
	}

	s.SetJunkItemSelected("a", true)
	if s.junkSel.count != 1 || s.junkSel.bytes != 10 {
		t.Fatalf("after select a: count=%d bytes=%d", s.junkSel.count, s.junkSel.bytes)
	}

	s.SetJunkCategorySelected("caches", true)
	if s.junkSel.count != 2 || s.junkSel.bytes != 30 {
		t.Fatalf("after select category: count=%d bytes=%d", s.junkSel.count, s.junkSel.bytes)
	}

	s.SetJunkItemSelected("b", false)
	if s.junkSel.count != 1 || s.junkSel.bytes != 10 {
		t.Fatalf("after deselect b: count=%d bytes=%d", s.junkSel.count, s.junkSel.bytes)
	}
}
