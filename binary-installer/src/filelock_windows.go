//go:build windows

package version

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

// platformTryLockFile locks the first byte of f exclusively without blocking.
// It reports false when another process holds the lock. The lock file holds no
// data, so the byte-range lock never blocks a reader.
func platformTryLockFile(f *os.File) (bool, error) {
	ol := new(windows.Overlapped)
	err := windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, ol)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
		return false, nil
	}
	return false, err
}

func unlockFile(f *os.File) error {
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, new(windows.Overlapped))
}
