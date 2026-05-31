//go:build !darwin

package delete

import "fmt"

func moveToTrashOS(path string) error {
	return fmt.Errorf("trash not supported on this platform")
}
