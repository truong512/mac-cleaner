package main

import (
	"context"
	"fmt"
	"os"

	"mac-cleaner/internal/catalog"
	"mac-cleaner/internal/delete"
	"mac-cleaner/internal/scan"
)

func main() {
	cat, err := catalog.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load catalog: %v\n", err)
		os.Exit(1)
	}

	engine := scan.NewEngine(cat)
	items, err := engine.ScanJunk(context.Background(), nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "scan: %v\n", err)
	}

	fmt.Printf("Found %d junk items\n", len(items))
	for _, c := range scan.Summarize(items) {
		fmt.Printf("  %s: %d items, %d bytes\n", c.Label, c.ItemCount, c.SizeBytes)
	}

	if len(os.Args) > 1 && os.Args[1] == "--dry-run" {
		svc := delete.NewService()
		report := svc.Preview(items)
		fmt.Printf("Preview: %d bytes in %d categories\n", report.TotalBytes, len(report.Categories))
	}
}
