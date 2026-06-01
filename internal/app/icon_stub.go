//go:build !darwin

package app

func AppIconDataURL(appPath string) (string, error) {
	_ = appPath
	return "", nil
}
