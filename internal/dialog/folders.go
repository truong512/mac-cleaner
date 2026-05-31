package dialog

import "context"

type Options struct {
	Title            string
	DefaultDirectory string
	AllowMultiple    bool
}

func PickFolders(ctx context.Context, opts Options) ([]string, error) {
	return pickFolders(ctx, opts)
}
