//go:build darwin

package dialog

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework Foundation
#import <Cocoa/Cocoa.h>
#import <stdlib.h>

static char* pickFoldersDialog(const char* title, const char* defaultDir, int allowMultiple) {
	__block char* result = NULL;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSOpenPanel *panel = [NSOpenPanel openPanel];
		[panel setCanChooseFiles:NO];
		[panel setCanChooseDirectories:YES];
		[panel setCanCreateDirectories:NO];
		[panel setAllowsMultipleSelection:allowMultiple ? YES : NO];
		if (title != NULL) {
			[panel setTitle:[NSString stringWithUTF8String:title]];
		}
		if (defaultDir != NULL && strlen(defaultDir) > 0) {
			NSString *dir = [NSString stringWithUTF8String:defaultDir];
			[panel setDirectoryURL:[NSURL fileURLWithPath:dir]];
		}
		if ([panel runModal] != NSModalResponseOK) {
			result = strdup("[]");
			return;
		}
		NSMutableArray *paths = [NSMutableArray array];
		for (NSURL *url in [panel URLs]) {
			[paths addObject:[url path]];
		}
		NSError *err = nil;
		NSData *data = [NSJSONSerialization dataWithJSONObject:paths options:0 error:&err];
		if (err != nil || data == nil) {
			result = strdup("[]");
			return;
		}
		NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
		result = strdup([json UTF8String]);
		[json release];
	});
	return result;
}
*/
import "C"
import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"unsafe"
)

func pickFolders(_ context.Context, opts Options) ([]string, error) {
	title := C.CString(opts.Title)
	defer C.free(unsafe.Pointer(title))

	defaultDir := opts.DefaultDirectory
	if defaultDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			defaultDir = home
		}
	}
	defaultDir = expandTilde(defaultDir)
	cDir := C.CString(defaultDir)
	defer C.free(unsafe.Pointer(cDir))

	multiple := 0
	if opts.AllowMultiple {
		multiple = 1
	}

	raw := C.pickFoldersDialog(title, cDir, C.int(multiple))
	if raw == nil {
		return nil, nil
	}
	defer C.free(unsafe.Pointer(raw))

	var paths []string
	if err := json.Unmarshal([]byte(C.GoString(raw)), &paths); err != nil {
		return nil, err
	}
	return paths, nil
}

func expandTilde(path string) string {
	if path == "" {
		return path
	}
	if path == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return home
	}
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, path[2:])
	}
	return path
}
