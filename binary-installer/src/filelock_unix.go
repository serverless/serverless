//go:build !windows

package version

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

// platformTryLockFile takes an exclusive flock on f without blocking. It
// reports false when another process holds the lock.
func platformTryLockFile(f *os.File) (bool, error) {
	err := unix.Flock(int(f.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, unix.EWOULDBLOCK) {
		return false, nil
	}
	return false, err
}

func unlockFile(f *os.File) error {
	return unix.Flock(int(f.Fd()), unix.LOCK_UN)
}
