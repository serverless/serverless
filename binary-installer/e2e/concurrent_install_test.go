//go:build e2e

// Package e2e runs the built launcher end to end: real release archives from
// the install host, real node, and several launcher processes at once against
// a fresh home directory — the situation of parallel CI jobs on a new runner.
//
// Run with: go test -tags e2e ./e2e/ -v -count=1 -timeout 45m
// Needs network access to install.serverless.com, and node and npm on PATH.
//
// E2E_LAUNCHER=<path> runs the suite against a prebuilt launcher, such as a
// `make build-prod` binary (CI does this, so it tests the release build).
// Without it, the launcher is built from source with the release build flags.
package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	// bundledVersion ships its dependencies inside the archive.
	bundledVersion = "4.43.0"
	// npmInstallVersion declares dependencies, so the launcher runs npm install.
	npmInstallVersion = "4.4.14"
)

var launcher string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "sls-e2e-launcher-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	launcher = filepath.Join(dir, "serverless")
	if runtime.GOOS == "windows" {
		launcher += ".exe"
	}
	if prebuilt := os.Getenv("E2E_LAUNCHER"); prebuilt != "" {
		// Copied rather than run in place: an artifact download drops the
		// executable bit, and Go on Windows runs only files named *.exe.
		b, err := os.ReadFile(prebuilt)
		if err == nil {
			err = os.WriteFile(launcher, b, 0o755)
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "using E2E_LAUNCHER %s: %v\n", prebuilt, err)
			os.Exit(1)
		}
		fmt.Printf("testing prebuilt launcher %s\n", prebuilt)
	} else {
		// The same flags as `make build-prod`.
		build := exec.Command("go", "build", "-trimpath", "-ldflags=-s -w", "-o", launcher, "..")
		build.Env = append(os.Environ(), "CGO_ENABLED=0")
		build.Stdout, build.Stderr = os.Stdout, os.Stderr
		if err := build.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "building launcher: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("testing launcher built from source with the release build flags")
	}
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

// concurrency is the number of launcher processes each scenario starts.
func concurrency(t *testing.T, fallback int) int {
	if v := os.Getenv("E2E_CONCURRENCY"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			t.Fatalf("invalid E2E_CONCURRENCY %q", v)
		}
		return n
	}
	return fallback
}

// newService writes a service pinned to version and returns its directory.
func newService(t *testing.T, version string) string {
	t.Helper()
	dir := t.TempDir()
	config := fmt.Sprintf("service: e2e-concurrent-install\nframeworkVersion: %q\nprovider:\n  name: aws\n", version)
	if err := os.WriteFile(filepath.Join(dir, "serverless.yml"), []byte(config), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// launcherEnv returns the environment for a launcher process that uses home
// as its home directory on every OS.
func launcherEnv(home string, extra ...string) []string {
	var env []string
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		switch strings.ToUpper(name) {
		case "HOME", "USERPROFILE", "CI", "SERVERLESS_FRAMEWORK_FORCE_UPDATE":
			continue
		}
		env = append(env, kv)
	}
	env = append(env, "HOME="+home, "USERPROFILE="+home, "CI=1")
	return append(env, extra...)
}

type result struct {
	output string
	err    error
}

// runLaunchers starts n launcher processes running `serverless --version`,
// spaced by stagger, and waits for all of them.
func runLaunchers(t *testing.T, home, service string, n int, stagger time.Duration, extraEnv ...string) []result {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	t.Logf("starting %d launchers (stagger %v); each downloads a release archive, so this can take a few minutes", n, stagger)

	results := make([]result, n)
	var wg sync.WaitGroup
	var mu sync.Mutex
	finished := 0
	for i := range n {
		if i > 0 && stagger > 0 {
			time.Sleep(stagger)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			cmd := exec.CommandContext(ctx, launcher, "--version")
			cmd.Dir = service
			cmd.Env = launcherEnv(home, extraEnv...)
			out, err := cmd.CombinedOutput()
			results[i] = result{output: string(out), err: err}
			mu.Lock()
			finished++
			t.Logf("  finished %d/%d", finished, n)
			mu.Unlock()
		}()
	}
	wg.Wait()
	return results
}

// requireAllSucceeded fails the test for every launcher that did not exit 0
// and print the expected Framework version.
func requireAllSucceeded(t *testing.T, results []result, version string) {
	t.Helper()
	failed := 0
	for i, r := range results {
		if r.err == nil && strings.Contains(r.output, version) {
			continue
		}
		failed++
		t.Errorf("launcher %d: err=%v\n%s", i+1, r.err, tail(r.output, 20))
	}
	if failed > 0 {
		t.Fatalf("%d of %d launchers failed", failed, len(results))
	}
}

// requireUsableAfterwards checks that a later, sequential run works and logs
// what the releases directory holds.
func requireUsableAfterwards(t *testing.T, home, service, version string) {
	t.Helper()
	requireAllSucceeded(t, runLaunchers(t, home, service, 1, 0), version)
	entries, _ := os.ReadDir(filepath.Join(home, ".serverless", "releases"))
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	t.Logf("releases directory: %v", names)
}

// requireInstalls fails unless exactly want launchers reported installing the
// release. With the per-version lock, parallel first runs install once and
// the others use that release.
func requireInstalls(t *testing.T, results []result, want int) {
	t.Helper()
	got := 0
	for _, r := range results {
		if strings.Contains(r.output, "Installed Serverless Framework") {
			got++
		}
	}
	if got != want {
		t.Fatalf("%d launchers installed the release, want %d", got, want)
	}
}

func tail(s string, lines int) string {
	parts := strings.Split(strings.TrimRight(s, "\n"), "\n")
	if len(parts) > lines {
		parts = parts[len(parts)-lines:]
	}
	return strings.Join(parts, "\n")
}

// Parallel first runs of a release whose dependencies are bundled.
func TestConcurrentFirstRun_BundledRelease(t *testing.T) {
	home, service := t.TempDir(), newService(t, bundledVersion)
	results := runLaunchers(t, home, service, concurrency(t, 8), 0)
	requireAllSucceeded(t, results, bundledVersion)
	requireInstalls(t, results, 1)
	requireUsableAfterwards(t, home, service, bundledVersion)
}

// Parallel first runs of a release that needs npm install. Launchers start a
// second apart, so later ones arrive while an earlier install is under way.
func TestConcurrentFirstRun_NpmInstallRelease(t *testing.T) {
	home, service := t.TempDir(), newService(t, npmInstallVersion)
	results := runLaunchers(t, home, service, concurrency(t, 6), time.Second)
	requireAllSucceeded(t, results, npmInstallVersion)
	requireInstalls(t, results, 1)
	requireUsableAfterwards(t, home, service, npmInstallVersion)
}

// Parallel forced updates of an installed release, as when
// SERVERLESS_FRAMEWORK_FORCE_UPDATE is set for every job of a pipeline.
func TestConcurrentForcedUpdate_InstalledRelease(t *testing.T) {
	home, service := t.TempDir(), newService(t, bundledVersion)
	requireAllSucceeded(t, runLaunchers(t, home, service, 1, 0), bundledVersion)
	results := runLaunchers(t, home, service, concurrency(t, 6), 0, "SERVERLESS_FRAMEWORK_FORCE_UPDATE=true")
	requireAllSucceeded(t, results, bundledVersion)
	requireInstalls(t, results, 0) // complete release: forced updates keep it
	requireUsableAfterwards(t, home, service, bundledVersion)
}

// Parallel first runs when ~/.serverless/releases is its own mount (a bind
// mount or volume, common in containers). E2E_MOUNTED_HOME names a home
// directory whose .serverless/releases is already a separate, empty mount.
func TestConcurrentFirstRun_MountedReleasesDirectory(t *testing.T) {
	home := os.Getenv("E2E_MOUNTED_HOME")
	if home == "" {
		t.Skip("E2E_MOUNTED_HOME not set")
	}
	service := newService(t, bundledVersion)
	results := runLaunchers(t, home, service, concurrency(t, 6), 0)
	requireAllSucceeded(t, results, bundledVersion)
	requireInstalls(t, results, 1)
	requireUsableAfterwards(t, home, service, bundledVersion)
}

// A launcher interrupted mid-install exits 130, leaves no directory behind,
// and does not hold up the next run.
func TestInterruptedInstall_CleansUp(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sending an interrupt to another process is not supported on Windows")
	}
	home, service := t.TempDir(), newService(t, bundledVersion)
	releasesDir := filepath.Join(home, ".serverless", "releases")

	cmd := exec.Command(launcher, "--version")
	cmd.Dir = service
	cmd.Env = launcherEnv(home)
	var out strings.Builder
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	// Interrupt once the install has created its temporary directory.
	deadline := time.Now().Add(30 * time.Second)
	for !hasTemporaryDir(releasesDir) {
		if time.Now().After(deadline) {
			_ = cmd.Process.Kill()
			t.Fatalf("install never started\n%s", out.String())
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := cmd.Process.Signal(os.Interrupt); err != nil {
		t.Fatal(err)
	}
	err := cmd.Wait()
	if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() != 130 {
		t.Fatalf("interrupted launcher: err=%v, want exit code 130\n%s", err, out.String())
	}
	entries, _ := os.ReadDir(releasesDir)
	for _, e := range entries {
		if e.IsDir() {
			t.Errorf("directory left behind after interrupt: %s", e.Name())
		}
	}
	requireAllSucceeded(t, runLaunchers(t, home, service, 1, 0), bundledVersion)
}

func hasTemporaryDir(releasesDir string) bool {
	entries, _ := os.ReadDir(releasesDir)
	for _, e := range entries {
		if e.IsDir() && strings.Contains(e.Name(), ".tmp-") {
			return true
		}
	}
	return false
}

// A launcher killed outright mid-install (kill -9, out of memory) leaves its
// lock to the operating system, which frees it: the next run installs at once
// instead of waiting out the 10-minute lock timeout.
func TestKilledInstall_DoesNotBlockNextRun(t *testing.T) {
	home, service := t.TempDir(), newService(t, bundledVersion)
	releasesDir := filepath.Join(home, ".serverless", "releases")

	cmd := exec.Command(launcher, "--version")
	cmd.Dir = service
	cmd.Env = launcherEnv(home)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(30 * time.Second)
	for !hasTemporaryDir(releasesDir) {
		if time.Now().After(deadline) {
			_ = cmd.Process.Kill()
			t.Fatal("install never started")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := cmd.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()

	start := time.Now()
	results := runLaunchers(t, home, service, 1, 0)
	if waited := time.Since(start); waited > 2*time.Minute {
		t.Fatalf("next run took %v; the killed launcher's lock was not freed", waited)
	}
	requireAllSucceeded(t, results, bundledVersion)
	if strings.Contains(results[0].output, "Waiting for another process") {
		t.Fatalf("next run waited for the killed launcher's lock:\n%s", results[0].output)
	}
}

// A launcher killed while its npm install child is still running must not
// leave the lock held by that child: the lock file is not inherited, so the
// orphaned npm process holds nothing and the next run installs at once.
func TestKilledDuringNpmInstall_DoesNotBlockNextRun(t *testing.T) {
	// The orphaned npm process may still be writing when the test ends, which
	// Windows would refuse to clean up, so the home directory is removed best
	// effort instead of through t.TempDir.
	home, err := os.MkdirTemp("", "sls-e2e-npm-kill-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	service := newService(t, npmInstallVersion)
	releasesDir := filepath.Join(home, ".serverless", "releases")

	cmd := exec.Command(launcher, "--version")
	cmd.Dir = service
	cmd.Env = launcherEnv(home)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	// Kill the launcher once npm install has started inside the build directory.
	deadline := time.Now().Add(2 * time.Minute)
	for !npmInstallStarted(releasesDir) {
		if time.Now().After(deadline) {
			_ = cmd.Process.Kill()
			t.Fatal("npm install never started")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := cmd.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Wait()

	start := time.Now()
	results := runLaunchers(t, home, service, 1, 0)
	if waited := time.Since(start); waited > 2*time.Minute {
		t.Fatalf("next run took %v; the lock outlived the killed launcher", waited)
	}
	requireAllSucceeded(t, results, npmInstallVersion)
	if strings.Contains(results[0].output, "Waiting for another process") {
		t.Fatalf("next run waited for a lock held after the launcher was killed:\n%s", results[0].output)
	}
}

// npmInstallStarted reports whether npm has created node_modules in a build
// directory under releasesDir.
func npmInstallStarted(releasesDir string) bool {
	entries, _ := os.ReadDir(releasesDir)
	for _, e := range entries {
		if e.IsDir() && strings.Contains(e.Name(), ".tmp-") {
			if _, err := os.Stat(filepath.Join(releasesDir, e.Name(), "package", "node_modules")); err == nil {
				return true
			}
		}
	}
	return false
}

// esbuildPlatform is the esbuild package directory for this OS and CPU.
func esbuildPlatform() string {
	return map[string]string{
		"darwin-arm64": "darwin-arm64", "darwin-amd64": "darwin-x64",
		"linux-arm64": "linux-arm64", "linux-amd64": "linux-x64",
		"windows-amd64": "win32-x64",
	}[runtime.GOOS+"-"+runtime.GOARCH]
}

// requireEsbuildRuns checks that the installed release's esbuild binary for
// this platform exists and runs. Framework commands that bundle code depend on
// it, and the install removes the other platforms' copies, so a mistake there
// would break those commands while `--version` still worked.
func requireEsbuildRuns(t *testing.T, home, version string) {
	t.Helper()
	pkg := filepath.Join(home, ".serverless", "releases", version, "package")
	name := filepath.Join("bin", "esbuild")
	if runtime.GOOS == "windows" {
		name = "esbuild.exe"
	}
	var candidates []string
	for _, nm := range []string{filepath.Join(pkg, "dist", "node_modules"), filepath.Join(pkg, "node_modules")} {
		candidates = append(candidates, filepath.Join(nm, "@esbuild", esbuildPlatform(), name))
	}
	for _, bin := range candidates {
		if _, err := os.Stat(bin); err != nil {
			continue
		}
		out, err := exec.Command(bin, "--version").CombinedOutput()
		if err != nil {
			t.Fatalf("esbuild at %s failed: %v\n%s", bin, err, out)
		}
		t.Logf("esbuild %s runs from %s", strings.TrimSpace(string(out)), bin)
		return
	}
	t.Fatalf("no esbuild binary for %s in the installed release; looked in %v", esbuildPlatform(), candidates)
}

// Parallel first runs where the home directory has a space in its path, as on
// Windows accounts like "C:\Users\John Smith". Uses the release that runs npm
// install, the step most sensitive to paths.
func TestConcurrentFirstRun_HomeWithSpaces(t *testing.T) {
	home := filepath.Join(t.TempDir(), "John Smith")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	service := newService(t, npmInstallVersion)
	results := runLaunchers(t, home, service, concurrency(t, 4), time.Second)
	requireAllSucceeded(t, results, npmInstallVersion)
	requireInstalls(t, results, 1)
	requireEsbuildRuns(t, home, npmInstallVersion)
}

// The platform's esbuild in a freshly installed bundled release runs.
func TestInstalledRelease_EsbuildRuns(t *testing.T) {
	home, service := t.TempDir(), newService(t, bundledVersion)
	requireAllSucceeded(t, runLaunchers(t, home, service, 1, 0), bundledVersion)
	requireEsbuildRuns(t, home, bundledVersion)
}

// releasedLauncherURL is where users download the current launcher from.
func releasedLauncherURL() string {
	return "https://install.serverless.com/installer-builds/serverless-" + runtime.GOOS + "-" + runtime.GOARCH
}

// downloadReleasedLauncher fetches the launcher users currently have.
func downloadReleasedLauncher(t *testing.T) string {
	t.Helper()
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Get(releasedLauncherURL())
	if err != nil {
		t.Fatalf("downloading the released launcher: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("downloading the released launcher: %s", resp.Status)
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "serverless-released")
	if runtime.GOOS == "windows" {
		path += ".exe"
	}
	if err := os.WriteFile(path, b, 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

// runOne runs one launcher binary with `--version` and returns its output.
func runOne(t *testing.T, bin, home, service string, extraEnv ...string) string {
	t.Helper()
	cmd := exec.Command(bin, "--version")
	cmd.Dir = service
	cmd.Env = launcherEnv(home, extraEnv...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s --version: %v\n%s", filepath.Base(bin), err, out)
	}
	return string(out)
}

// A machine where the currently published launcher already installed a
// release, upgraded to this launcher: the release is used as it is, without a
// download, also on a forced update. This holds whichever launcher version is
// published, since both leave the same release directory.
func TestUpgradeFromReleasedLauncher(t *testing.T) {
	const version = "4.42.0"
	released := downloadReleasedLauncher(t)
	home, service := t.TempDir(), newService(t, version)
	entry := filepath.Join(home, ".serverless", "releases", version, "package", "dist", "sf-core.js")

	if out := runOne(t, released, home, service); !strings.Contains(out, "Installed Serverless Framework") {
		t.Fatalf("released launcher did not install %s:\n%s", version, out)
	}
	before, err := os.Stat(entry)
	if err != nil {
		t.Fatal(err)
	}

	if out := runOne(t, launcher, home, service); strings.Contains(out, "Installed Serverless Framework") {
		t.Fatalf("this launcher reinstalled a release the released launcher had installed:\n%s", out)
	}
	if out := runOne(t, launcher, home, service, "SERVERLESS_FRAMEWORK_FORCE_UPDATE=true"); strings.Contains(out, "Installed Serverless Framework") {
		t.Fatalf("a forced update reinstalled a complete release:\n%s", out)
	}
	after, err := os.Stat(entry)
	if err != nil || !os.SameFile(before, after) {
		t.Fatal("the released launcher's release was replaced")
	}
	requireEsbuildRuns(t, home, version)
}

// Parallel first runs started through the npm package's wrapper
// (`npm i -g serverless`), the only way to install on Windows. The wrapper is
// set up from this repository and given this launcher as its binary.
func TestConcurrentFirstRun_ThroughNpmWrapper(t *testing.T) {
	wrapper := setupNpmWrapper(t)
	home, service := t.TempDir(), newService(t, bundledVersion)
	n := concurrency(t, 6)
	t.Logf("starting %d launchers through the npm wrapper", n)

	results := make([]result, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cmd := exec.Command("node", filepath.Join(wrapper, "run.js"), "--version")
			cmd.Dir = service
			cmd.Env = launcherEnv(home)
			out, err := cmd.CombinedOutput()
			results[i] = result{output: string(out), err: err}
		}()
	}
	wg.Wait()
	requireAllSucceeded(t, results, bundledVersion)
	requireInstalls(t, results, 1)
	// The wrapper downloads the released launcher when its binary is missing;
	// make sure it ran this one.
	used, err := os.ReadFile(wrapperBinaryPath(wrapper))
	ours, _ := os.ReadFile(launcher)
	if err != nil || !bytes.Equal(used, ours) {
		t.Fatal("the npm wrapper did not run the launcher under test")
	}
}

// wrapperBinaryPath is where the npm wrapper keeps its launcher binary.
func wrapperBinaryPath(wrapper string) string {
	return filepath.Join(wrapper, "node_modules", ".bin", "serverless-"+runtime.GOOS+"-"+runtime.GOARCH+"-0.0.2")
}

// setupNpmWrapper copies the npm package's wrapper (packages/sf-core-installer)
// to a temporary directory, installs its dependencies, and puts this launcher
// where the wrapper looks for its binary, so it never downloads one.
func setupNpmWrapper(t *testing.T) string {
	t.Helper()
	src := filepath.Join("..", "..", "packages", "sf-core-installer")
	dst := filepath.Join(t.TempDir(), "sf-core-installer")
	// The modules npm publishes: the "files" list in package.json, so a module
	// added to the wrapper is copied too
	manifest, err := os.ReadFile(filepath.Join(src, "package.json"))
	if err != nil {
		t.Fatalf("reading the npm wrapper: %v", err)
	}
	var pkg struct {
		Files []string `json:"files"`
	}
	if err := json.Unmarshal(manifest, &pkg); err != nil || len(pkg.Files) == 0 {
		t.Fatalf("reading the files list of the npm wrapper: %v", err)
	}
	for _, name := range append([]string{"package.json", "package-lock.json", ".npmrc"}, pkg.Files...) {
		b, err := os.ReadFile(filepath.Join(src, name))
		if err != nil {
			t.Fatalf("reading the npm wrapper: %v", err)
		}
		if err := os.MkdirAll(dst, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dst, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	npm := exec.Command("npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund")
	npm.Dir = dst
	if out, err := npm.CombinedOutput(); err != nil {
		t.Fatalf("npm ci for the wrapper: %v\n%s", err, out)
	}
	binary := wrapperBinaryPath(dst)
	b, err := os.ReadFile(launcher)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(binary), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, b, 0o755); err != nil {
		t.Fatal(err)
	}
	return dst
}
