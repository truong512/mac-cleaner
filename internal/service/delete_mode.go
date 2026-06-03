package service

import "mac-cleaner/internal/delete"

func deleteMode(permanent bool) delete.Mode {
	if permanent {
		return delete.ModePermanent
	}
	return delete.ModeTrash
}
