package delete

import "fmt"

type Mode int

const (
	ModeTrash Mode = iota
	ModePermanent
)

func (m Mode) progressVerb() string {
	if m == ModePermanent {
		return "Deleting permanently"
	}
	return "Moving to Trash"
}

func (m Mode) StartingMessage(total int) string {
	return fmt.Sprintf("%s (0 of %d)...", m.progressVerb(), total)
}

func (m Mode) ProgressMessage(completed, total int) string {
	return fmt.Sprintf("%s (%d of %d)...", m.progressVerb(), completed, total)
}
