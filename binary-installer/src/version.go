package version

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
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
		return nil, fmt.Errorf("no matching version found for constraint %s: %w", frameworkVersion, err)
	}

	return &GetVersionResult{
		matchedVersion:               matchedVersion,
		shouldPrintAutoUpdateWarning: shouldPrintAutoUpdateWarning,
	}, nil
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
			fmt.Fprintf(os.Stderr, "No version found for %s\n", version)
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

	releasePath, err := downloadFrameworkVersion(releaseRecord, shouldCheckForUpdates, shouldPrintAutoUpdateWarning)
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

func downloadFrameworkVersion(releaseRecord *ReleaseRecord, shouldCheckForUpdates bool, shouldPrintAutoUpdateWarning bool) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolving home dir: %w", err)
	}

	releasePath := filepath.Join(homeDir, ".serverless", "releases", string(releaseRecord.Version))

	// This may always pull for the latest that matches user's requested version
	useSpinner := !IsCIEnvironment()
	spinnerStopped := false
	if _, err := os.Stat(releasePath); os.IsNotExist(err) || shouldCheckForUpdates {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		installCompleted := false
		defer func() {
			if !installCompleted {
				if err := os.RemoveAll(releasePath); err != nil {
					fmt.Fprintf(os.Stderr, "Failed to remove incomplete installation at %s: %v\nPlease run `serverless update` to reinstall.\n", releasePath, err)
				}
			}
		}()

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
				path := filepath.Join(releasePath, cleanPath)
				if !strings.HasPrefix(path, filepath.Clean(releasePath)+string(os.PathSeparator)) {
					return "", fmt.Errorf("invalid file path")
				}
				if err := os.MkdirAll(path, 0755); err != nil {
					return "", fmt.Errorf("creating directory %s: %w", path, err)
				}
				dirPaths[path] = true
			case tar.TypeReg:
				cleanPath := filepath.Clean(header.Name)
				path := filepath.Join(releasePath, cleanPath)
				if !strings.HasPrefix(path, filepath.Clean(releasePath)+string(os.PathSeparator)) {
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
		cmd := exec.CommandContext(ctx, "npm", "install", "--no-audit", "--no-fund", "--no-progress")
		cmd.Env = os.Environ()
		cmd.Dir = filepath.Join(releasePath, "package")

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

		metadata.WriteLocalMetadata(string(releaseRecord.Version))
		installCompleted = true
		stopSpinner()

		fmt.Fprintf(os.Stderr, "✔ Installed Serverless Framework v%s\n", releaseRecord.Version)
		if shouldPrintAutoUpdateWarning {
			color.RGB(140, 141, 145).Printf("Disable auto-updates by adding \"frameworkVersion\" to your serverless.yml (frameworkVersion: ~%s)\n", releaseRecord.Version)
		}
	}
	return releasePath, nil
}

type ReleaseRecord struct {
	Version       FrameworkVersion `json:"version"`
	Installable   bool             `json:"installable"`
	ReleaseDate   string           `json:"releaseDate"`
	DownloadUrl   string           `json:"downloadUrl"`
	LatestVersion FrameworkVersion `json:"latestVersion"`
}
