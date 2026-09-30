package version

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const testReleaseVersion = "4.99.0"

// testEntryContent is large enough that a half-written copy is detectable.
var testEntryContent = strings.Repeat("// sf-core bundle line\n", 4096)

// buildTestArchive returns a gzipped tarball shaped like a bundled release
// (package.json without dependencies, dist/sf-core.js) and the byte offset of
// a gzip flush point in the middle of dist/sf-core.js. Serving the archive up
// to that offset lets the reader extract package.json and part of sf-core.js,
// then stall there.
func buildTestArchive(t *testing.T) ([]byte, int) {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	writeEntry := func(name string, body []byte) {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
	}
	for _, dir := range []string{"package/", "package/dist/"} {
		if err := tw.WriteHeader(&tar.Header{Name: dir, Mode: 0o755, Typeflag: tar.TypeDir}); err != nil {
			t.Fatal(err)
		}
	}
	pkg := []byte(`{"name":"@serverlessinc/framework-alpha","version":"` + testReleaseVersion + `","dependencies":{}}`)
	writeEntry("package/package.json", pkg)
	if _, err := tw.Write(pkg); err != nil {
		t.Fatal(err)
	}
	entry := []byte(testEntryContent)
	writeEntry("package/dist/sf-core.js", entry)
	half := len(entry) / 2
	if _, err := tw.Write(entry[:half]); err != nil {
		t.Fatal(err)
	}
	// tar.Writer streams entry bytes straight through; flushing gzip makes
	// everything written so far decodable.
	if err := gz.Flush(); err != nil {
		t.Fatal(err)
	}
	stallAt := buf.Len()
	if _, err := tw.Write(entry[half:]); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes(), stallAt
}

// setupInstallHome points HOME at a fresh directory with only the binaries
// directory the launcher creates at startup, and silences the spinner.
func setupInstallHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CI", "1")
	if err := os.MkdirAll(filepath.Join(home, ".serverless", "binaries"), 0o755); err != nil {
		t.Fatal(err)
	}
	return home
}

func testReleaseRecord(url string) *ReleaseRecord {
	return &ReleaseRecord{
		Version:       FrameworkVersion(testReleaseVersion),
		DownloadUrl:   url,
		LatestVersion: FrameworkVersion(testReleaseVersion),
	}
}

func readEntry(t *testing.T, releasePath string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(releasePath, "package", "dist", "sf-core.js"))
	if err != nil {
		t.Fatalf("reading entry file: %v", err)
	}
	return string(b)
}

// waitForExtractionStarted blocks until some launcher has extracted
// package.json anywhere under ~/.serverless, i.e. an install is in progress.
func waitForExtractionStarted(t *testing.T, home string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		found := false
		_ = filepath.WalkDir(filepath.Join(home, ".serverless"), func(p string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() && d.Name() == "package.json" {
				found = true
				return filepath.SkipAll
			}
			return nil
		})
		if found {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("first install never started extracting")
}

// A launcher that starts while another is still extracting the same release
// must get a complete release, never the other launcher's partial directory.

// servedArchive serves the test archive and counts requests.
func servedArchive(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	archive, _ := buildTestArchive(t)
	var requests atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = w.Write(archive)
	}))
	t.Cleanup(ts.Close)
	return ts, &requests
}

// failingServer answers every request with 503 and counts requests.
func failingServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var requests atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	t.Cleanup(ts.Close)
	return ts, &requests
}

// writeTestRelease lays out a usable bundled release in dir.
func writeTestRelease(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, "package", "dist"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package", "package.json"), []byte(`{"dependencies":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "package", "dist", "sf-core.js"), []byte(testEntryContent), 0o644); err != nil {
		t.Fatal(err)
	}
}

func releasesDirOf(home string) string { return filepath.Join(home, ".serverless", "releases") }

// withoutLocking makes release locks unavailable for the test, as on a
// filesystem that does not support them.
func withoutLocking(t *testing.T) {
	t.Helper()
	orig := tryLockFile
	tryLockFile = func(*os.File) (bool, error) { return false, errors.ErrUnsupported }
	t.Cleanup(func() { tryLockFile = orig })
}

// startStalledInstall starts an install whose download stalls mid-archive
// until the returned release function is called, and waits until it is
// extracting.
func startStalledInstall(t *testing.T, home string) (url string, requests *atomic.Int32, release func(), done <-chan error) {
	t.Helper()
	archive, stallAt := buildTestArchive(t)
	unblock := make(chan struct{})
	requests = &atomic.Int32{}
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			_, _ = w.Write(archive[:stallAt])
			w.(http.Flusher).Flush()
			<-unblock
			_, _ = w.Write(archive[stallAt:])
			return
		}
		_, _ = w.Write(archive)
	}))
	var once sync.Once
	release = func() { once.Do(func() { close(unblock) }) }
	errs := make(chan error, 1)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		_, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
		errs <- err
	}()
	t.Cleanup(func() {
		release()
		<-finished
		ts.Close()
	})
	waitForExtractionStarted(t, home)
	return ts.URL, requests, release, errs
}

// A launcher that starts while another is installing the same release waits
// for it and uses its release: the archive is downloaded once, and the waiter
// never sees a partial release.
func TestDownloadFrameworkVersion_ConcurrentInstallWaitsForPeer(t *testing.T) {
	home := setupInstallHome(t)
	url, requests, release, firstDone := startStalledInstall(t, home)

	secondDone := make(chan string, 1)
	go func() {
		p, err := downloadFrameworkVersion(testReleaseRecord(url), false)
		if err != nil {
			t.Errorf("second install: %v", err)
		}
		secondDone <- p
	}()
	select {
	case <-secondDone:
		t.Fatal("second launcher returned while the first was still installing")
	case <-time.After(300 * time.Millisecond):
	}

	release()
	if err := <-firstDone; err != nil {
		t.Fatalf("first install: %v", err)
	}
	secondPath := <-secondDone
	if got := readEntry(t, secondPath); got != testEntryContent {
		t.Fatalf("second launcher got an incomplete release: entry file is %d of %d bytes", len(got), len(testEntryContent))
	}
	if n := requests.Load(); n != 1 {
		t.Fatalf("archive downloaded %d times, want 1", n)
	}
}

// Without locking, concurrent installs each build a private copy and the
// first to publish wins; no launcher ever gets a partial release.
func TestDownloadFrameworkVersion_ConcurrentInstallWithoutLockingNeverRunsPartialRelease(t *testing.T) {
	withoutLocking(t)
	home := setupInstallHome(t)
	url, _, release, firstDone := startStalledInstall(t, home)

	secondPath, err := downloadFrameworkVersion(testReleaseRecord(url), false)
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if got := readEntry(t, secondPath); got != testEntryContent {
		t.Fatalf("second launcher got an incomplete release: entry file is %d of %d bytes", len(got), len(testEntryContent))
	}
	release()
	if err := <-firstDone; err != nil {
		t.Fatalf("first install: %v", err)
	}
	if got := readEntry(t, secondPath); got != testEntryContent {
		t.Fatal("release is incomplete after both installs")
	}
}

// A launcher that cannot get the lock within the wait limit installs without
// it rather than failing.
func TestDownloadFrameworkVersion_ProceedsAfterLockWaitTimeout(t *testing.T) {
	home := setupInstallHome(t)
	origTimeout := lockWaitTimeout
	lockWaitTimeout = 300 * time.Millisecond
	t.Cleanup(func() { lockWaitTimeout = origTimeout })

	if err := os.MkdirAll(releasesDirOf(home), 0o755); err != nil {
		t.Fatal(err)
	}
	unlock, locked, err := lockRelease(context.Background(), releasesDirOf(home), testReleaseVersion)
	if err != nil || !locked {
		t.Fatalf("test could not take the lock: locked=%v err=%v", locked, err)
	}
	defer unlock()

	ts, _ := servedArchive(t)
	start := time.Now()
	p, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if waited := time.Since(start); waited < lockWaitTimeout {
		t.Fatalf("install returned after %v, before the %v lock wait ran out", waited, lockWaitTimeout)
	}
	if got := readEntry(t, p); got != testEntryContent {
		t.Fatal("release is incomplete")
	}
}

// The lock is released before the install returns, so the node process the
// launcher starts next never holds it.
func TestDownloadFrameworkVersion_ReleasesLockBeforeReturning(t *testing.T) {
	home := setupInstallHome(t)
	ts, _ := servedArchive(t)
	if _, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false); err != nil {
		t.Fatalf("install: %v", err)
	}
	f, err := os.OpenFile(releaseLockPath(releasesDirOf(home), testReleaseVersion), os.O_RDWR, 0)
	if err != nil {
		t.Fatalf("opening lock file: %v", err)
	}
	defer f.Close()
	ok, err := tryLockFile(f)
	if err != nil || !ok {
		t.Fatalf("lock still held after install returned (ok=%v, err=%v)", ok, err)
	}
	_ = unlockFile(f)
}

// An install that fails part-way leaves no directory behind, so the next run
// installs from scratch. Only the lock file remains.
func TestDownloadFrameworkVersion_FailedInstallLeavesNoDirectories(t *testing.T) {
	home := setupInstallHome(t)
	archive, stallAt := buildTestArchive(t)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Truncated archive: the extraction fails with an unexpected EOF.
		w.Header().Set("Content-Length", "999999")
		_, _ = w.Write(archive[:stallAt])
	}))
	defer ts.Close()

	if _, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false); err == nil {
		t.Fatal("expected the install to fail")
	}
	entries, _ := os.ReadDir(releasesDirOf(home))
	for _, e := range entries {
		if e.IsDir() {
			t.Errorf("unexpected directory left in releases directory: %s", e.Name())
		}
	}
}

// Temporary directories left by a launcher that was killed outright are swept
// by a later install once they are old enough that no install can still be
// using them; recent ones are left alone.
func TestDownloadFrameworkVersion_SweepsStaleTemporaryDirectories(t *testing.T) {
	home := setupInstallHome(t)
	ts, _ := servedArchive(t)
	releasesDir := releasesDirOf(home)
	stale := filepath.Join(releasesDir, ".4.1.0.tmp-1-1")
	recent := filepath.Join(releasesDir, ".4.1.0.tmp-2-2")
	for _, dir := range []string{stale, recent} {
		if err := os.MkdirAll(filepath.Join(dir, "package"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-staleTemporaryAge - time.Hour)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}

	if _, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false); err != nil {
		t.Fatalf("install: %v", err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("stale temporary directory was not removed")
	}
	if _, err := os.Stat(recent); err != nil {
		t.Errorf("recent temporary directory should be kept: %v", err)
	}
}

// The release is built inside the releases directory, so publishing is a
// rename within one filesystem even when releases/ is a symlink to another
// location, and nothing is written beside it.
func TestDownloadFrameworkVersion_SymlinkedReleasesDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks needs extra privileges on Windows")
	}
	home := setupInstallHome(t)
	ts, _ := servedArchive(t)
	target := filepath.Join(t.TempDir(), "releases")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, releasesDirOf(home)); err != nil {
		t.Fatal(err)
	}

	releasePath, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if got := readEntry(t, releasePath); got != testEntryContent {
		t.Fatal("release is incomplete")
	}
	entries, _ := os.ReadDir(filepath.Join(home, ".serverless"))
	for _, e := range entries {
		if name := e.Name(); name != "binaries" && name != "releases" {
			t.Errorf("unexpected entry beside the releases directory: %s", name)
		}
	}
	// The install worked inside the link target: its lock file is there.
	if _, err := os.Stat(releaseLockPath(target, testReleaseVersion)); err != nil {
		t.Errorf("install did not work inside the symlink target: %v", err)
	}
}

// The published release directory keeps the permissions the launcher always
// gave it (0755 before umask).
func TestDownloadFrameworkVersion_ReleaseDirectoryPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits do not apply on Windows")
	}
	setupInstallHome(t)
	ts, _ := servedArchive(t)
	releasePath, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	reference := filepath.Join(t.TempDir(), "reference")
	if err := os.MkdirAll(reference, 0o755); err != nil {
		t.Fatal(err)
	}
	want, _ := os.Stat(reference)
	got, err := os.Stat(releasePath)
	if err != nil {
		t.Fatal(err)
	}
	if got.Mode().Perm() != want.Mode().Perm() {
		t.Fatalf("release directory mode = %v, want %v", got.Mode().Perm(), want.Mode().Perm())
	}
}

// A rename is retried only while it can still succeed: the source exists and
// the destination does not. A vanished source means a peer moved it, so
// retrying would only stall that launcher.
func TestRenameRetryable(t *testing.T) {
	dir := t.TempDir()
	existing := filepath.Join(dir, "existing")
	other := filepath.Join(dir, "other")
	for _, d := range []string{existing, other} {
		if err := os.Mkdir(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	missing := filepath.Join(dir, "missing")
	cases := []struct {
		name     string
		from, to string
		want     bool
	}{
		{"source present, destination absent", existing, missing, true},
		{"source gone", missing, filepath.Join(dir, "absent"), false},
		{"destination exists", existing, other, false},
	}
	for _, c := range cases {
		if got := renameRetryable(c.from, c.to); got != c.want {
			t.Errorf("%s: renameRetryable = %v, want %v", c.name, got, c.want)
		}
	}
}

// Ctrl-C while waiting for another launcher's lock ends the wait at once with
// the cancellation (exit code 130).
func TestLockRelease_CancelWhileWaiting(t *testing.T) {
	releasesDir := t.TempDir()
	unlock, locked, err := lockRelease(context.Background(), releasesDir, testReleaseVersion)
	if err != nil || !locked {
		t.Fatalf("taking the lock: locked=%v err=%v", locked, err)
	}
	defer unlock()

	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(100*time.Millisecond, cancel)
	type outcome struct {
		locked bool
		err    error
	}
	done := make(chan outcome, 1)
	go func() {
		_, locked, err := lockRelease(ctx, releasesDir, testReleaseVersion)
		done <- outcome{locked, err}
	}()
	select {
	case o := <-done:
		if !errors.Is(o.err, context.Canceled) || o.locked {
			t.Fatalf("lockRelease = locked %v, err %v; want context.Canceled", o.locked, o.err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("lockRelease kept waiting after the context was cancelled")
	}
}

// The stale sweep removes old temporary directories and nothing else:
// releases, files, and symlinks are kept, and a symlink is never followed out
// of the releases directory.
func TestRemoveStaleTemporaryDirs_NeverLeavesReleasesDirectory(t *testing.T) {
	releasesDir := t.TempDir()
	outside := t.TempDir()
	userFile := filepath.Join(outside, "keep.txt")
	if err := os.WriteFile(userFile, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-staleTemporaryAge - time.Hour)
	mkOld := func(name string, dir bool) string {
		p := filepath.Join(releasesDir, name)
		var err error
		if dir {
			err = os.MkdirAll(filepath.Join(p, "package"), 0o755)
		} else {
			err = os.WriteFile(p, []byte("x"), 0o644)
		}
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, old, old); err != nil {
			t.Fatal(err)
		}
		return p
	}
	removed := []string{
		mkOld(".4.1.0.tmp-123-456", true),
		mkOld(".4.1.0.tmp-123-456.previous-0", true),
		mkOld(".canary-abc1234.tmp-1-2", true),
	}
	kept := []string{
		mkOld("4.1.0", true),
		mkOld(".4.1.0.tmp-7-8.txt", false),
		mkOld(".fseventsd", true),
	}
	if runtime.GOOS != "windows" {
		link := filepath.Join(releasesDir, ".4.1.0.tmp-9-9")
		if err := os.Symlink(outside, link); err != nil {
			t.Fatal(err)
		}
		kept = append(kept, link)
	}

	removeStaleTemporaryDirs(releasesDir)
	for _, p := range removed {
		if _, err := os.Lstat(p); !os.IsNotExist(err) {
			t.Errorf("stale temporary directory was kept: %s", filepath.Base(p))
		}
	}
	for _, p := range kept {
		if _, err := os.Lstat(p); err != nil {
			t.Errorf("entry that is not a temporary directory was removed: %s", filepath.Base(p))
		}
	}
	if _, err := os.Stat(userFile); err != nil {
		t.Error("a file outside the releases directory was removed")
	}
}

// captureStderr returns what fn writes to os.Stderr.
func captureStderr(t *testing.T, fn func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	orig := os.Stderr
	os.Stderr = w
	out := make(chan string, 1)
	go func() {
		b, _ := io.ReadAll(r)
		out <- string(b)
	}()
	defer func() {
		os.Stderr = orig
	}()
	fn()
	_ = w.Close()
	os.Stderr = orig
	return <-out
}

// A launcher that waits on another's lock tells the user after lockNoticeAfter,
// and says so again when it stops waiting; a short wait prints nothing.
func TestLockRelease_WaitingNotice(t *testing.T) {
	origNotice, origTimeout := lockNoticeAfter, lockWaitTimeout
	t.Cleanup(func() { lockNoticeAfter, lockWaitTimeout = origNotice, origTimeout })

	t.Run("long wait", func(t *testing.T) {
		lockNoticeAfter, lockWaitTimeout = 100*time.Millisecond, 500*time.Millisecond
		releasesDir := t.TempDir()
		unlock, _, _ := lockRelease(context.Background(), releasesDir, testReleaseVersion)
		defer unlock()
		stderr := captureStderr(t, func() {
			_, locked, err := lockRelease(context.Background(), releasesDir, testReleaseVersion)
			if err != nil || locked {
				t.Errorf("lockRelease = locked %v, err %v; want to proceed without the lock", locked, err)
			}
		})
		for _, want := range []string{
			"Waiting for another process to finish installing Serverless Framework v" + testReleaseVersion + "...",
			"installing without waiting further",
		} {
			if !strings.Contains(stderr, want) {
				t.Errorf("stderr lacks %q:\n%s", want, stderr)
			}
		}
		if n := strings.Count(stderr, "Waiting for another process"); n != 1 {
			t.Errorf("waiting notice printed %d times, want once", n)
		}
	})

	t.Run("short wait", func(t *testing.T) {
		lockNoticeAfter, lockWaitTimeout = 2*time.Second, time.Minute
		releasesDir := t.TempDir()
		unlock, _, _ := lockRelease(context.Background(), releasesDir, testReleaseVersion)
		time.AfterFunc(200*time.Millisecond, unlock)
		stderr := captureStderr(t, func() {
			release, locked, err := lockRelease(context.Background(), releasesDir, testReleaseVersion)
			if err != nil || !locked {
				t.Errorf("lockRelease = locked %v, err %v; want the lock", locked, err)
			}
			release()
		})
		if stderr != "" {
			t.Errorf("a short wait printed:\n%s", stderr)
		}
	})
}

// When the lock file cannot be opened (here a directory sits at its path),
// the install proceeds without the lock instead of failing.
func TestDownloadFrameworkVersion_ProceedsWhenLockFileCannotBeOpened(t *testing.T) {
	home := setupInstallHome(t)
	ts, _ := servedArchive(t)
	if err := os.MkdirAll(releaseLockPath(releasesDirOf(home), testReleaseVersion), 0o755); err != nil {
		t.Fatal(err)
	}
	_, locked, err := lockRelease(context.Background(), releasesDirOf(home), testReleaseVersion)
	if err != nil || locked {
		t.Fatalf("lockRelease = locked %v, err %v; want to proceed without the lock", locked, err)
	}
	p, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if got := readEntry(t, p); got != testEntryContent {
		t.Fatal("release is incomplete")
	}
}

// A releases directory the user cannot write to fails the install with an
// error naming the directory and the cause.
func TestDownloadFrameworkVersion_ReadOnlyReleasesDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits do not apply on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	home := setupInstallHome(t)
	ts, _ := servedArchive(t)
	releasesDir := releasesDirOf(home)
	if err := os.MkdirAll(releasesDir, 0o555); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(releasesDir, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(releasesDir, 0o755) })

	_, err := downloadFrameworkVersion(testReleaseRecord(ts.URL), false)
	if err == nil {
		t.Fatal("expected the install to fail")
	}
	for _, want := range []string{"creating directory", releasesDir, "permission denied"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q lacks %q", err, want)
		}
	}
}

// An existing release directory is used as it is and never downloaded,
// replaced or modified, with or without the lock, whatever it contains:
// this launcher only ever creates it complete (by one rename), and a
// directory left incomplete by an older launcher is deleted by the user
// (see the docs). A forced update refreshes the versions list and so may pick
// a newer release, but never reinstalls this one.
func TestDownloadFrameworkVersion_ExistingReleaseIsUsedAsIs(t *testing.T) {
	cases := map[string]func(t *testing.T, dir string){
		"complete release": func(t *testing.T, dir string) { writeTestRelease(t, dir) },
		"incomplete directory": func(t *testing.T, dir string) {
			if err := os.MkdirAll(filepath.Join(dir, "package"), 0o755); err != nil {
				t.Fatal(err)
			}
		},
	}
	for name, seed := range cases {
		for _, lock := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/lock=%v", name, lock), func(t *testing.T) {
				if !lock {
					withoutLocking(t)
				}
				home := setupInstallHome(t)
				failing, requests := failingServer(t)
				releasePath := filepath.Join(releasesDirOf(home), testReleaseVersion)
				seed(t, releasePath)
				marker := filepath.Join(releasePath, "left-by-another-launcher")
				if err := os.WriteFile(marker, []byte("x"), 0o644); err != nil {
					t.Fatal(err)
				}

				got, err := downloadFrameworkVersion(testReleaseRecord(failing.URL), false)
				if err != nil {
					t.Fatalf("install: %v", err)
				}
				if got != releasePath {
					t.Fatalf("release path = %q, want %q", got, releasePath)
				}
				if n := requests.Load(); n != 0 {
					t.Fatalf("release was downloaded %d times, want 0", n)
				}
				if _, err := os.Stat(marker); err != nil {
					t.Fatal("the existing release directory was replaced")
				}
			})
		}
	}
}

// Launchers without the lock publish the same release at once. Each succeeds,
// and once a release has appeared it never disappears, even briefly: a
// launcher that finds a release already published keeps it.
func TestPublishRelease_ConcurrentPublishersKeepTheFirstRelease(t *testing.T) {
	for round := 0; round < 25; round++ {
		releasesDir := t.TempDir()
		releasePath := filepath.Join(releasesDir, testReleaseVersion)
		const launchers = 8
		stagings := make([]string, launchers)
		for i := range stagings {
			stagings[i] = filepath.Join(releasesDir, fmt.Sprintf(".%s.tmp-%d", testReleaseVersion, i))
			writeTestRelease(t, stagings[i])
		}

		entry := filepath.Join(releasePath, "package", "dist", "sf-core.js")
		var stop atomic.Bool
		vanished := make(chan bool, 1)
		go func() {
			seen := false
			for !stop.Load() {
				if _, err := os.Stat(entry); err == nil {
					seen = true
				} else if seen {
					vanished <- true
					return
				}
			}
			vanished <- false
		}()

		errs := make(chan error, launchers)
		start := make(chan struct{})
		for _, staging := range stagings {
			go func() {
				<-start
				errs <- publishRelease(staging, releasePath)
			}()
		}
		close(start)
		for range stagings {
			if err := <-errs; err != nil {
				t.Fatalf("round %d: publishRelease: %v", round, err)
			}
		}
		stop.Store(true)
		if <-vanished {
			t.Fatalf("round %d: a published release disappeared", round)
		}
		if got := readEntry(t, releasePath); got != testEntryContent {
			t.Fatalf("round %d: release is incomplete", round)
		}
	}
}

// When the build cannot be renamed into place and nothing is there, publishing
// fails and reports the path.
func TestPublishRelease_FailsWhenBuildCannotBeMoved(t *testing.T) {
	releasesDir := t.TempDir()
	releasePath := filepath.Join(releasesDir, testReleaseVersion)
	missingStaging := filepath.Join(releasesDir, "."+testReleaseVersion+".tmp-1-1")
	err := publishRelease(missingStaging, releasePath)
	if err == nil || !strings.Contains(err.Error(), releasePath) {
		t.Fatalf("publishRelease = %v, want an error naming %s", err, releasePath)
	}
}

// When releases/<version> is a symlink to a directory of the user's, the
// launcher uses it and never modifies or deletes what it points to.
func TestDownloadFrameworkVersion_SymlinkedReleaseIsNeverTouched(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks needs extra privileges on Windows")
	}
	home := setupInstallHome(t)
	failing, requests := failingServer(t)
	target := filepath.Join(t.TempDir(), "my-release")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	userFile := filepath.Join(target, "notes.txt")
	if err := os.WriteFile(userFile, []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(releasesDirOf(home), 0o755); err != nil {
		t.Fatal(err)
	}
	releasePath := filepath.Join(releasesDirOf(home), testReleaseVersion)
	if err := os.Symlink(target, releasePath); err != nil {
		t.Fatal(err)
	}

	if _, err := downloadFrameworkVersion(testReleaseRecord(failing.URL), false); err != nil {
		t.Fatalf("install: %v", err)
	}
	if n := requests.Load(); n != 0 {
		t.Fatalf("release was downloaded %d times, want 0", n)
	}
	if info, err := os.Lstat(releasePath); err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("the symlink was replaced")
	}
	if b, err := os.ReadFile(userFile); err != nil || string(b) != "mine" {
		t.Fatalf("the symlink target was modified: %v", err)
	}
}

// A dangling symlink at releases/<version> counts as an existing release like
// anything else there: it is left alone and nothing is downloaded, rather than
// every run trying and failing to install over it. (The command then fails in
// Node with an error pointing at the release folder, which the docs cover.)
func TestDownloadFrameworkVersion_DanglingSymlinkCountsAsExisting(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks needs extra privileges on Windows")
	}
	home := setupInstallHome(t)
	failing, requests := failingServer(t)
	if err := os.MkdirAll(releasesDirOf(home), 0o755); err != nil {
		t.Fatal(err)
	}
	releasePath := filepath.Join(releasesDirOf(home), testReleaseVersion)
	if err := os.Symlink(filepath.Join(t.TempDir(), "gone"), releasePath); err != nil {
		t.Fatal(err)
	}

	got, err := downloadFrameworkVersion(testReleaseRecord(failing.URL), false)
	if err != nil {
		t.Fatalf("install: %v", err)
	}
	if got != releasePath {
		t.Fatalf("release path = %q, want %q", got, releasePath)
	}
	if n := requests.Load(); n != 0 {
		t.Fatalf("release was downloaded %d times, want 0", n)
	}
	if info, err := os.Lstat(releasePath); err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("the symlink was replaced")
	}
}

// Stale temporary directories are also swept when the launcher refreshes the
// versions list (at most once a day), so a machine that never installs
// another release still loses a killed install's leftovers.
func TestGetVersionsFile_RefreshSweepsStaleTemporaryDirectories(t *testing.T) {
	home := setupInstallHome(t)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"blockedVersions":[],"supportedVersions":["4.1.0"]}`))
	}))
	defer ts.Close()

	releasesDir := releasesDirOf(home)
	stale := filepath.Join(releasesDir, ".4.1.0.tmp-1-1")
	recent := filepath.Join(releasesDir, ".4.1.0.tmp-2-2")
	for _, dir := range []string{stale, recent} {
		if err := os.MkdirAll(filepath.Join(dir, "package"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-staleTemporaryAge - time.Hour)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}

	if _, err := getVersionsFileWithURL(ts.URL, true); err != nil {
		t.Fatalf("refreshing the versions list: %v", err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Error("stale temporary directory was not removed on refresh")
	}
	if _, err := os.Stat(recent); err != nil {
		t.Errorf("recent temporary directory should be kept: %v", err)
	}
}
