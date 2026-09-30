//go:build windows

package version

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// On Windows a directory cannot be renamed while a file inside it is open,
// which is what antivirus scanners do to freshly written files. renameDir
// retries until the file is closed.
func TestRenameDir_RetriesWhileAFileInsideIsOpen(t *testing.T) {
	dir := t.TempDir()
	from := filepath.Join(dir, "build")
	writeTestRelease(t, from)
	f, err := os.Open(filepath.Join(from, "package", "dist", "sf-core.js"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(from, filepath.Join(dir, "probe")); err == nil {
		_ = f.Close()
		t.Skip("this Windows filesystem renames directories with open files; nothing to retry")
	}
	time.AfterFunc(300*time.Millisecond, func() { _ = f.Close() })

	to := filepath.Join(dir, "published")
	if err := renameDir(from, to); err != nil {
		t.Fatalf("renameDir: %v", err)
	}
	if got := readEntry(t, to); got != testEntryContent {
		t.Fatal("renamed release is incomplete")
	}
}
