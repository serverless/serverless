package version

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math/rand/v2"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/Masterminds/semver"

	"sf-core/src/metadata"

	"github.com/briandowns/spinner"
	"github.com/fatih/color"
	"gopkg.in/yaml.v3"
)

const (
	ERROR_NO_FRAMEWORK_VERSION = "ERROR_NO_FRAMEWORK_VERSION"
	ERROR_NOT_IN_FRAMEWORK_DIR = "ERROR_NOT_IN_FRAMEWORK_DIR"
)

type FrameworkVersion string

func (fv *FrameworkVersion) UnmarshlYAML(value *yaml.Node) error {
	var strValue string

	switch value.Kind {
	case yaml.ScalarNode:
		strValue = value.Value
	default:
		return errors.New("invalid value type")
	}

	*fv = FrameworkVersion(strValue)
	return nil
}

func (fv *FrameworkVersion) releasePath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf("%s/.serverless/releases/%s", homeDir, string(*fv))
}

type FrameworkRelease struct {
	Version       FrameworkVersion
	ReleasePath   string
	LatestVersion *FrameworkVersion
}

const versionsFileURL = "https://install.serverless.com/versions.json"

func fetchURL(url string) ([]byte, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("GET %s: %s; body: %s", url, resp.Status, strings.TrimSpace(string(b)))
	}
	return io.ReadAll(resp.Body)
}

func parseVersions(body []byte) (*metadata.VersionsFile, error) {
	var vf metadata.VersionsFile
	if err := json.Unmarshal(body, &vf); err != nil {
		return nil, err
	}
	return &vf, nil
}

func getVersionsFileWithURL(url string, force bool) (*metadata.VersionsFile, error) {
	cacheDir, cachePath := metadata.VersionsCachePath()

	if cached, ok := metadata.ReadVersionsFromCache(cachePath, 24*time.Hour, force); ok {
		return cached, nil
	}

	body, err := fetchURL(url)
	if err != nil {
		if b, readErr := os.ReadFile(cachePath); readErr == nil {
			if cached, parseErr := parseVersions(b); parseErr == nil {
				return cached, nil
			}
		}
		return nil, fmt.Errorf("fetching %s: %w", url, err)
	}

	vf, err := parseVersions(body)
	if err != nil {
		if b, readErr := os.ReadFile(cachePath); readErr == nil {
			if cached, parseErr := parseVersions(b); parseErr == nil {
				return cached, nil
			}
		}
		return nil, err
	}

	metadata.WriteVersionsCache(cacheDir, cachePath, body)
	// Bump updateLastChecked now that we've fetched a fresh index
	metadata.TouchLocalMetadataTimestamp()
	// This runs at most once a day, so it also clears a killed install's
	// leftovers on a machine that never installs another release.
	if homeDir, err := os.UserHomeDir(); err == nil {
		removeStaleTemporaryDirs(filepath.Join(homeDir, ".serverless", "releases"))
	}
	return vf, nil
}

func getVersionsFile(force bool) (*metadata.VersionsFile, error) {
	return getVersionsFileWithURL(versionsFileURL, force)
}

func IsCIEnvironment() bool {
	val, ok := os.LookupEnv("CI")
	if !ok {
		return false
	}
	return val != "0"
}

type GetVersionResult struct {
	matchedVersion               string
	shouldPrintAutoUpdateWarning bool
}

func getVersion(frameworkVersion string, force bool) (*GetVersionResult, error) {
	versionsFile, err := getVersionsFile(force)
	if err != nil {
		return nil, err
	}

	// Create a map of blocked versions for O(1) lookup
	blockedVersions := make(map[string]bool)
	for _, v := range versionsFile.BlockedVersions {
		blockedVersions[v] = true
	}

	if blockedVersions[frameworkVersion] {
		fmt.Printf("WARNING: This version, %s, of Serverless Framework contains known bugs or security issues and has been flagged. We recommend you upgrade to a more recent version.\n", frameworkVersion)
	}

	shouldPrintAutoUpdateWarning := false
	// If no version constraint is provided, return the latest supported version
	if frameworkVersion == "" {
		if len(versionsFile.SupportedVersions) == 0 {
			return nil, fmt.Errorf("no supported versions available")
		}
		if IsCIEnvironment() {
			shouldPrintAutoUpdateWarning = true
			// fmt.Printf("Disable auto-updates by adding \"frameworkVersion\" to your serverless.yml (frameworkVersion: ~4.15.0)\n")
		}
		return &GetVersionResult{
			matchedVersion:               versionsFile.SupportedVersions[len(versionsFile.SupportedVersions)-1],
			shouldPrintAutoUpdateWarning: shouldPrintAutoUpdateWarning,
		}, nil
	}

	// Find the closest match from supported versions based on the constraint
	matchedVersion, err := findClosestMatch(versionsFile.SupportedVersions, frameworkVersion)
	if err != nil {
		// A valid constraint that no supported release satisfies gets its own
		// error type, so the caller can say what to do about the pin.
		if _, constraintErr := semver.NewConstraint(frameworkVersion); constraintErr == nil {
			return nil, &noMatchingVersionError{
				constraint: frameworkVersion,
				supported:  versionsFile.SupportedVersions,
			}
		}
		return nil, fmt.Errorf("no matching version found for constraint %s: %w", frameworkVersion, err)
	}

	return &GetVersionResult{
		matchedVersion:               matchedVersion,
		shouldPrintAutoUpdateWarning: shouldPrintAutoUpdateWarning,
	}, nil
}

// canaryVersionPattern matches the accepted pinned-canary version format: the
// "canary-" prefix followed by one or more alphanumerics, dots, dashes, or
// underscores.
var canaryVersionPattern = regexp.MustCompile(`^canary-[A-Za-z0-9._-]+$`)

// validateCanaryVersion returns an error for pinned-canary version strings that
// are not in the expected format. The pattern confines the value to a single
// path component (its character class excludes path separators), so a matching
// value can never traverse. The explicit ".." check is defense-in-depth: it
// rejects a "canary-.."-style name up front, though containedReleasePath would
// keep it contained regardless.
func validateCanaryVersion(version string) error {
	if !canaryVersionPattern.MatchString(version) || strings.Contains(version, "..") {
		return fmt.Errorf("invalid framework version %q", version)
	}
	return nil
}

// containedReleasePath joins version into releasesDir and returns the result
// only when version resolves to a direct child of releasesDir (a single path
// component). A version that resolves to releasesDir itself, to a parent, or to
// any nested or outside location yields an error.
func containedReleasePath(releasesDir, version string) (string, error) {
	releasePath := filepath.Join(releasesDir, version)
	rel, err := filepath.Rel(releasesDir, releasePath)
	if err != nil ||
		rel == "." ||
		rel == ".." ||
		strings.ContainsRune(rel, os.PathSeparator) {
		return "", fmt.Errorf("invalid release path for version %q", version)
	}
	return releasePath, nil
}

func getMostRecentCanaryVersionWithBaseURL(base string) (string, error) {
	body, err := fetchURL(fmt.Sprintf("%s/releases.json", base))
	if err != nil {
		return "", fmt.Errorf("fetching canary releases.json: %w", err)
	}
	releaseData := map[string]any{}
	if err := json.Unmarshal(body, &releaseData); err != nil {
		return "", err
	}
	return releaseData["version"].(string), nil
}

func getMostRecentCanaryVersion() (string, error) {
	return getMostRecentCanaryVersionWithBaseURL("https://install.serverless-dev.com")
}

func GetFrameworkVersion(filename string, shouldCheckForUpdates bool) (*FrameworkRelease, error) {
	version, err := getFrameworkVersionFromFile(filename)
	if err != nil && (err.Error() != ERROR_NO_FRAMEWORK_VERSION && err.Error() != ERROR_NOT_IN_FRAMEWORK_DIR) {
		fmt.Fprintf(os.Stderr, "reading framework version from %s: %v\n", filename, err)
		return localReleaseFallback(&version)
	}

	isCanary := false

	if strings.HasPrefix(version, "canary") || version == "canary" {
		isCanary = true
	}

	if isCanary {
		color.Yellow("Using Canary release channel\n")
	}

	var releaseRecord *ReleaseRecord

	shouldPrintAutoUpdateWarning := false
	if isCanary {
		if version == "canary" {
			mostRecentVersion, err := getMostRecentCanaryVersion()
			if err != nil {
				return nil, err
			}
			releaseRecord = &ReleaseRecord{
				Version:       FrameworkVersion(mostRecentVersion),
				ReleaseDate:   time.Now().Format(time.RFC3339),
				DownloadUrl:   fmt.Sprintf("https://install.serverless-dev.com/archives/canary-%s.tgz", mostRecentVersion),
				LatestVersion: FrameworkVersion(mostRecentVersion),
			}
		} else {
			if err := validateCanaryVersion(version); err != nil {
				return nil, err
			}
			releaseRecord = &ReleaseRecord{
				Version:       FrameworkVersion(version),
				ReleaseDate:   time.Now().Format(time.RFC3339),
				DownloadUrl:   fmt.Sprintf("https://install.serverless-dev.com/archives/%s.tgz", version),
				LatestVersion: FrameworkVersion(version),
			}
		}

	} else {
		matchedVersion, err := getVersion(version, shouldCheckForUpdates)
		if err != nil {
			fmt.Fprintln(os.Stderr, describeVersionResolutionError(version, filename, err))
			os.Exit(1)
		}
		shouldPrintAutoUpdateWarning = matchedVersion.shouldPrintAutoUpdateWarning
		releaseRecord = &ReleaseRecord{
			Version:       FrameworkVersion(matchedVersion.matchedVersion),
			ReleaseDate:   time.Now().Format(time.RFC3339),
			DownloadUrl:   fmt.Sprintf("https://install.serverless.com/archives/serverless-%s.tgz", matchedVersion.matchedVersion),
			LatestVersion: FrameworkVersion(matchedVersion.matchedVersion),
		}
	}

	releasePath, err := downloadFrameworkVersion(releaseRecord, shouldPrintAutoUpdateWarning)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			fmt.Fprintf(os.Stderr, "Installation interrupted\n")
			os.Exit(130)
		}
		panic(err)
	}
	return &FrameworkRelease{
		Version:       releaseRecord.Version,
		ReleasePath:   releasePath,
		LatestVersion: &releaseRecord.LatestVersion,
	}, nil
}

// noMatchingVersionError: the service pins a valid frameworkVersion that no
// supported release satisfies.
type noMatchingVersionError struct {
	constraint string
	supported  []string
}

func (e *noMatchingVersionError) Error() string {
	return fmt.Sprintf("no supported release matches frameworkVersion %q", e.constraint)
}

var leadingVersion = regexp.MustCompile(`\d+(\.\d+){0,2}`)

// shellSafeSpec matches package specs a shell passes through unchanged.
var shellSafeSpec = regexp.MustCompile(`^[A-Za-z0-9@._^~+-]+$`)

// npmPackageSpec renders serverless@<constraint> so it can be copied into a
// shell: a range such as ">=2 <4" is single-quoted, since < and > redirect.
func npmPackageSpec(constraint string) string {
	spec := "serverless@" + constraint
	if shellSafeSpec.MatchString(spec) {
		return spec
	}
	return "'" + strings.ReplaceAll(spec, "'", `'\''`) + "'"
}

// describeVersionResolutionError explains why frameworkVersion could not be
// resolved and what to do. Every version it names comes from the pin or from
// the versions index, so the text stays true as releases are added. A pin
// older than every supported release is the one case a project-local install
// helps: runLocalVersionIfAvailable runs a project's own older copy.
func describeVersionResolutionError(constraint, configFile string, err error) string {
	file := filepath.Base(configFile)
	var noMatch *noMatchingVersionError
	if !errors.As(err, &noMatch) {
		return fmt.Sprintf("Could not resolve frameworkVersion %q in %s: %v", constraint, file, err)
	}
	var releases semver.Collection
	for _, v := range noMatch.supported {
		if sv, parseErr := semver.NewVersion(v); parseErr == nil {
			releases = append(releases, sv)
		}
	}
	if len(releases) == 0 {
		return fmt.Sprintf("No release matches frameworkVersion %q in %s.", constraint, file)
	}
	sort.Sort(releases)
	oldest, newest := releases[0], releases[len(releases)-1]
	upgrade := fmt.Sprintf(
		"To use the newest release, change frameworkVersion to a range that includes %s (for example %q).",
		newest.Original(), fmt.Sprint(newest.Major()),
	)
	if pinned, parseErr := semver.NewVersion(leadingVersion.FindString(constraint)); parseErr == nil && pinned.LessThan(oldest) {
		return fmt.Sprintf(
			"frameworkVersion %q in %s is older than any release this CLI can install (%s to %s).\n"+
				"To keep using it, add it to the project with \"npm install --save-dev %s\"; this CLI then runs the project's copy.\n"+
				"%s Then run \"serverless agent skills read serverless-upgrade\" here: that Agent Skill walks through the rest of the upgrade.",
			constraint, file, oldest.Original(), newest.Original(), npmPackageSpec(constraint), upgrade,
		)
	}
	return fmt.Sprintf(
		"No release matches frameworkVersion %q in %s (releases available: %s to %s). %s",
		constraint, file, oldest.Original(), newest.Original(), upgrade,
	)
}

func findClosestMatch(versions []string, constraint string) (string, error) {
	// Parse the constraint
	c, err := semver.NewConstraint(constraint)
	if err != nil {
		return "", fmt.Errorf("invalid constraint: %w", err)
	}

	// Parse and sort the versions
	var semvers semver.Collection
	for _, v := range versions {
		sv, err := semver.NewVersion(v)
		if err != nil {
			return "", fmt.Errorf("invalid version %s: %w", v, err)
		}
		semvers = append(semvers, sv)
	}
	sort.Sort(sort.Reverse(semvers))

	// Find the closest match
	for _, v := range semvers {
		if c.Check(v) {
			return v.Original(), nil
		}
	}

	return "", fmt.Errorf("no matching version found")
}

// downloadFrameworkVersion installs the release unless its directory already
// exists, and returns its path. An existing release is never reinstalled, even
// on a forced update: this launcher only ever creates the directory complete,
// by one rename, releases do not change once published, and another command
// may be running from it. A forced update still refreshes the versions list
// (see getVersion), so it installs a newer matching release when there is one.
// A directory left incomplete by an older launcher, which extracted in place,
// is removed by the user to reinstall it.
func downloadFrameworkVersion(releaseRecord *ReleaseRecord, shouldPrintAutoUpdateWarning bool) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}

	releasesDir := filepath.Join(homeDir, ".serverless", "releases")
	releasePath, err := containedReleasePath(releasesDir, string(releaseRecord.Version))
	if err != nil {
		return "", err
	}

	useSpinner := !IsCIEnvironment()
	spinnerStopped := false
	if !releaseExists(releasePath) {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		// Launchers installing the same release take turns: one installs while
		// the others wait for it and then use its release. Without the lock
		// (unsupported filesystem, or a wait that ran too long) the install is
		// still safe, because the release is built in a private directory and
		// published with a single rename.
		if err := os.MkdirAll(releasesDir, 0755); err != nil {
			return "", fmt.Errorf("creating directory %s: %w", releasesDir, err)
		}
		unlock, _, err := lockRelease(ctx, releasesDir, string(releaseRecord.Version))
		if err != nil {
			return "", err
		}
		defer unlock()
		if releaseExists(releasePath) {
			return releasePath, nil // installed by another launcher while this one waited
		}

		removeStaleTemporaryDirs(releasesDir)
		stagingPath, err := makeStagingDir(releasesDir, string(releaseRecord.Version))
		if err != nil {
			return "", err
		}
		defer os.RemoveAll(stagingPath)

		var s *spinner.Spinner
		if useSpinner {
			fmt.Printf("\n")
			s = spinner.New(spinner.CharSets[14], 100*time.Millisecond)
			s.Suffix = " Updating"
			s.Color("red")
			s.Start()
		} else {
			fmt.Fprintln(os.Stderr, "Updating Serverless Framework...")
		}

		stopSpinner := func() {
			if useSpinner && s != nil && !spinnerStopped {
				s.Stop()
				clearLength := len(s.Suffix) + 10
				fmt.Print("\r" + strings.Repeat(" ", clearLength) + "\r")
				spinnerStopped = true
			}
		}
		defer stopSpinner()

		archiveUrl := releaseRecord.DownloadUrl

		client := http.Client{Timeout: 5 * time.Minute}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, archiveUrl, nil)
		if err != nil {
			return "", fmt.Errorf("creating request for %s: %w", archiveUrl, err)
		}

		response, err := client.Do(request)
		if err != nil {
			return "", fmt.Errorf("downloading archive from %s: %w", archiveUrl, err)
		}
		defer response.Body.Close()

		if response.StatusCode != http.StatusOK {
			// Read a small snippet of the response body for context
			limited := io.LimitReader(response.Body, 2048)
			b, _ := io.ReadAll(limited)
			return "", fmt.Errorf("download failed: GET %s returned %s; body: %s", archiveUrl, response.Status, strings.TrimSpace(string(b)))
		}

		gzipStream, err := gzip.NewReader(response.Body)
		if err != nil {
			return "", fmt.Errorf("decompressing archive from %s: %w", archiveUrl, err)
		}
		defer gzipStream.Close()

		tarReader := tar.NewReader(gzipStream)

		dirPaths := make(map[string]bool)

		for {
			if err := ctx.Err(); err != nil {
				return "", err
			}

			header, err := tarReader.Next()

			if err == io.EOF {
				break
			}

			if err != nil {
				return "", fmt.Errorf("reading archive entry: %w", err)
			}

			switch header.Typeflag {
			case tar.TypeDir:
				cleanPath := filepath.Clean(header.Name)
				path := filepath.Join(stagingPath, cleanPath)
				if !strings.HasPrefix(path, filepath.Clean(stagingPath)+string(os.PathSeparator)) {
					return "", fmt.Errorf("invalid file path")
				}
				if err := os.MkdirAll(path, 0755); err != nil {
					return "", fmt.Errorf("creating directory %s: %w", path, err)
				}
				dirPaths[path] = true
			case tar.TypeReg:
				cleanPath := filepath.Clean(header.Name)
				path := filepath.Join(stagingPath, cleanPath)
				if !strings.HasPrefix(path, filepath.Clean(stagingPath)+string(os.PathSeparator)) {
					return "", fmt.Errorf("invalid file path")
				}
				dirPath := filepath.Dir(path)
				if !dirPaths[dirPath] {
					if err := os.MkdirAll(dirPath, os.ModePerm); err != nil {
						return "", fmt.Errorf("creating directory %s: %w", dirPath, err)
					}
					dirPaths[dirPath] = true
				}
				outFile, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR|os.O_TRUNC, os.FileMode(header.Mode))
				if err != nil {
					return "", fmt.Errorf("opening file %s: %w", path, err)
				}
				n, writeErr := io.Copy(outFile, tarReader)
				closeErr := outFile.Close()
				if writeErr != nil {
					return "", fmt.Errorf("writing file %s (wrote %d bytes): %w", path, n, writeErr)
				}
				if closeErr != nil {
					return "", fmt.Errorf("closing file %s: %w", path, closeErr)
				}
			default:
				return "", fmt.Errorf("unexpected tar entry type %q in %s", string(header.Typeflag), header.Name)
			}
		}
		// Check if the archive has dependencies — new archives (bundled archive format) have
		// no dependencies and ship esbuild binaries directly in dist/node_modules/.
		needsNpmInstall, err := archiveHasDependencies(filepath.Join(stagingPath, "package"))
		if err != nil {
			return "", fmt.Errorf("checking archive dependencies: %w", err)
		}

		if needsNpmInstall {
			cmd := exec.CommandContext(ctx, "npm", "install", "--no-audit", "--no-fund", "--no-progress")
			cmd.Env = os.Environ()
			cmd.Dir = filepath.Join(stagingPath, "package")

			// Capture combined output for failure reporting while staying silent on success
			output, err := cmd.CombinedOutput()
			if err != nil {
				stopSpinner()

				// Cancellation fast-path
				if errors.Is(err, context.Canceled) {
					return "", context.Canceled
				}

				// Child exited abnormally — check for signal
				var ee *exec.ExitError
				if errors.As(err, &ee) {

					// Windows Ctrl-C/Break (STATUS_CONTROL_C_EXIT)
					if runtime.GOOS == "windows" {
						const statusControlCExit = uint32(0xC000013A)
						if uint32(ee.ExitCode()) == statusControlCExit {
							return "", context.Canceled
						}
					}

					if ws, ok := ee.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
						sig := ws.Signal()
						switch sig {
						case syscall.SIGINT, syscall.SIGTERM, syscall.SIGKILL:
							// Normalize to cancel and skip noisy logs
							return "", context.Canceled
						default:
							// e.g., SIGKILL → 128+9=137
							fmt.Fprintf(os.Stderr, "npm install failed (exit code %d)\n", 128+int(sig))
						}
					} else {
						// Normal non-zero exit
						fmt.Fprintf(os.Stderr, "npm install failed (exit code %d)\n", ee.ExitCode())
					}
				} else {
					// Not an ExitError; print a generic failure line
					fmt.Fprintf(os.Stderr, "npm install failed\n")
				}
				fmt.Fprintf(os.Stderr, "dir: %s\n", cmd.Dir)
				fmt.Fprintf(os.Stderr, "command: npm install --no-audit --no-fund --no-progress\n")
				fmt.Fprintf(os.Stderr, "error: %v\n", err)
				if len(output) > 0 {
					os.Stderr.Write(output)
				}
				return "", fmt.Errorf("npm install failed: %w", err)
			}
		} else {
			// New archive format: all deps bundled, esbuild binaries shipped.
			// Clean up unused platform esbuild binaries to save ~40MB disk space.
			cleanupUnusedEsbuildBinaries(filepath.Join(stagingPath, "package", "dist", "node_modules", "@esbuild"))
		}

		if err := publishRelease(stagingPath, releasePath); err != nil {
			return "", err
		}

		metadata.WriteLocalMetadata(string(releaseRecord.Version))
		stopSpinner()

		fmt.Fprintf(os.Stderr, "✔ Installed Serverless Framework v%s\n", releaseRecord.Version)
		if shouldPrintAutoUpdateWarning {
			color.RGB(140, 141, 145).Printf("Disable auto-updates by adding \"frameworkVersion\" to your serverless.yml (frameworkVersion: ~%s)\n", releaseRecord.Version)
		}
	}
	return releasePath, nil
}

// staleTemporaryAge is how old a temporary directory must be before a later
// install removes it. Only a launcher killed outright leaves one behind, and
// no install runs anywhere near this long.
const staleTemporaryAge = 24 * time.Hour

// Release-lock tuning; variables so tests can shorten them.
var (
	tryLockFile      = platformTryLockFile
	lockPollInterval = 200 * time.Millisecond
	lockNoticeAfter  = 2 * time.Second
	lockWaitTimeout  = 10 * time.Minute
)

// releaseLockPath is the lock file guarding installs of version. Lock files
// are never deleted: deleting one while another launcher has it open would let
// two launchers hold locks on different files.
func releaseLockPath(releasesDir, version string) string {
	return filepath.Join(releasesDir, "."+version+".lock")
}

// lockRelease waits until this launcher is the only one installing version
// and returns the function that ends that, and whether the lock is held. It
// never fails for want of a lock: if the lock file cannot be opened or locked,
// or another launcher holds it longer than lockWaitTimeout, it returns without
// the lock (locked is false); the install is then still correct but may be
// duplicated. It fails only when ctx is cancelled. The lock file is opened close-on-exec, so neither npm nor the
// node process started after the install inherits the lock.
func lockRelease(ctx context.Context, releasesDir, version string) (unlock func(), locked bool, err error) {
	noLock := func() {}
	f, err := os.OpenFile(releaseLockPath(releasesDir, version), os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return noLock, false, nil
	}
	start := time.Now()
	announced := false
	for {
		ok, err := tryLockFile(f)
		if err != nil {
			_ = f.Close()
			return noLock, false, nil
		}
		if ok {
			return func() {
				_ = unlockFile(f)
				_ = f.Close()
			}, true, nil
		}
		waited := time.Since(start)
		if waited >= lockWaitTimeout {
			fmt.Fprintf(os.Stderr, "Another process has been installing Serverless Framework v%s for %s; installing without waiting further.\n", version, waited.Round(time.Second))
			_ = f.Close()
			return noLock, false, nil
		}
		if !announced && waited >= lockNoticeAfter {
			fmt.Fprintf(os.Stderr, "Waiting for another process to finish installing Serverless Framework v%s...\n", version)
			announced = true
		}
		select {
		case <-ctx.Done():
			_ = f.Close()
			return nil, false, ctx.Err()
		case <-time.After(lockPollInterval):
		}
	}
}

// makeStagingDir creates a fresh directory in releasesDir in which to build
// version, and returns its path. Building inside releases/ keeps publishing a
// rename within one filesystem, even when releases/ is a mount point or a
// symlink to another volume. The name starts with a dot, so the local-release
// fallback never takes it for a release.
func makeStagingDir(releasesDir, version string) (string, error) {
	// os.MkdirTemp would create the directory owner-only; os.Mkdir with 0755
	// gives the release the mode (after umask) release directories have always had.
	for range 100 {
		path := filepath.Join(releasesDir, fmt.Sprintf(".%s.tmp-%d-%d", version, os.Getpid(), rand.Uint32()))
		err := os.Mkdir(path, 0755)
		if err == nil {
			return path, nil
		}
		if !os.IsExist(err) {
			return "", fmt.Errorf("creating directory %s: %w", path, err)
		}
	}
	return "", fmt.Errorf("creating a temporary directory in %s: too many name collisions", releasesDir)
}

// releaseExists reports whether anything is in place at releasePath. Anything
// there counts as installed, even a dangling symlink: this launcher only
// creates it by renaming a complete build into place, and never replaces it.
func releaseExists(releasePath string) bool {
	_, err := os.Lstat(releasePath)
	return !errors.Is(err, fs.ErrNotExist)
}

// publishRelease moves the release built in stagingPath to releasePath with a
// single rename. If another launcher published the release first, its copy is
// kept and this one is discarded by the caller. An existing release directory
// is never moved or replaced, so a command running from it is never affected.
func publishRelease(stagingPath, releasePath string) error {
	err := renameDir(stagingPath, releasePath)
	if err == nil || releaseExists(releasePath) {
		return nil
	}
	return fmt.Errorf("installing release to %s: %w", releasePath, err)
}

// renameDir renames a directory. On Windows it retries with backoff for about
// 10 seconds, because antivirus scanners and indexers hold handles on newly
// written files, which makes renaming their directory fail. It stops as soon
// as a retry cannot succeed (see renameRetryable).
func renameDir(from, to string) error {
	err := os.Rename(from, to)
	delay := 10 * time.Millisecond
	for attempt := 0; err != nil && runtime.GOOS == "windows" && attempt < 10; attempt++ {
		if !renameRetryable(from, to) {
			break
		}
		time.Sleep(delay)
		delay *= 2
		err = os.Rename(from, to)
	}
	return err
}

// renameRetryable reports whether a failed rename of from to to may still
// succeed: from exists and to does not. An existing destination means
// another launcher published first.
func renameRetryable(from, to string) bool {
	if _, err := os.Stat(from); err != nil {
		return false
	}
	_, err := os.Stat(to)
	return errors.Is(err, fs.ErrNotExist)
}

// removeStaleTemporaryDirs removes install directories in releasesDir that
// are older than staleTemporaryAge. Symlinks are never followed. Failures are
// ignored: a leftover directory only costs disk space.
func removeStaleTemporaryDirs(releasesDir string) {
	entries, err := os.ReadDir(releasesDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() || !strings.HasPrefix(name, ".") || !strings.Contains(name, ".tmp-") {
			continue
		}
		info, err := entry.Info()
		if err != nil || time.Since(info.ModTime()) < staleTemporaryAge {
			continue
		}
		_ = os.RemoveAll(filepath.Join(releasesDir, name))
	}
}

// archiveHasDependencies reads the extracted package.json and returns true if
// the archive has npm dependencies that require `npm install`. New archives
// (bundled archive format) have no dependencies — all deps are bundled or shipped directly.
func archiveHasDependencies(packageDir string) (bool, error) {
	type packageJSON struct {
		Dependencies map[string]string `json:"dependencies"`
	}

	packageJsonPath := filepath.Join(packageDir, "package.json")
	data, err := os.ReadFile(packageJsonPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No package.json — skip npm install.
			return false, nil
		}
		// File exists but can't be read (permissions, I/O error) — fail the install.
		return false, fmt.Errorf("reading %s: %w", packageJsonPath, err)
	}

	var pkg packageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		// Corrupted package.json — fail the install rather than silently continuing.
		return false, fmt.Errorf("parsing %s: %w", packageJsonPath, err)
	}

	return len(pkg.Dependencies) > 0, nil
}

// goPlatformToEsbuildDir maps "<GOOS>-<GOARCH>" to the corresponding esbuild npm
// package directory name. Single source of truth for both the current-platform
// lookup (esbuildPlatformDir) and the deletion allowlist (validEsbuildPlatforms).
var goPlatformToEsbuildDir = map[string]string{
	"darwin-arm64":  "darwin-arm64",
	"darwin-amd64":  "darwin-x64",
	"linux-arm64":   "linux-arm64",
	"linux-amd64":   "linux-x64",
	"windows-amd64": "win32-x64",
}

// esbuildPlatformDir returns the esbuild platform-binary directory name for the
// current Go runtime, or "" if the platform isn't supported.
func esbuildPlatformDir() string {
	return goPlatformToEsbuildDir[runtime.GOOS+"-"+runtime.GOARCH]
}

// validEsbuildPlatforms is the set of known esbuild platform directory names,
// derived from goPlatformToEsbuildDir. Used as an allowlist before deletion to
// prevent path traversal.
var validEsbuildPlatforms = func() map[string]bool {
	m := make(map[string]bool, len(goPlatformToEsbuildDir))
	for _, dir := range goPlatformToEsbuildDir {
		m[dir] = true
	}
	return m
}()

// cleanupUnusedEsbuildBinaries removes esbuild platform binary directories for
// platforms other than the current one. The archive ships all 5 platform binaries;
// after extraction we keep only the one matching the current OS/ARCH.
func cleanupUnusedEsbuildBinaries(esbuildDir string) {
	currentPlatform := esbuildPlatformDir()
	if currentPlatform == "" {
		return
	}

	entries, err := os.ReadDir(esbuildDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && name != currentPlatform && validEsbuildPlatforms[name] {
			os.RemoveAll(filepath.Join(esbuildDir, name))
		}
	}
}

type ReleaseRecord struct {
	Version       FrameworkVersion `json:"version"`
	Installable   bool             `json:"installable"`
	ReleaseDate   string           `json:"releaseDate"`
	DownloadUrl   string           `json:"downloadUrl"`
	LatestVersion FrameworkVersion `json:"latestVersion"`
}
