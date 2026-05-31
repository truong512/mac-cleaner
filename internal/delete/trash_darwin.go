//go:build darwin

package delete

import go2trash "github.com/rafshawn/go2trash"

func moveToTrashOS(path string) error {
	return go2trash.MoveToTrash(path)
}
