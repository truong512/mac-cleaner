//go:build !darwin

package dialog

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func pickFolders(ctx context.Context, opts Options) ([]string, error) {
	if opts.AllowMultiple {
		return nil, fmt.Errorf("multiple folder selection is only supported on macOS")
	}
	selected, err := runtime.OpenDirectoryDialog(ctx, runtime.OpenDialogOptions{
		Title:            opts.Title,
		DefaultDirectory: opts.DefaultDirectory,
	})
	if err != nil {
		return nil, err
	}
	if selected == "" {
		return nil, nil
	}
	return []string{selected}, nil
}
