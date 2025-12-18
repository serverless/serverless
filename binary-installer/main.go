package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	version "sf-core/src"
	"sf-core/src/certs"

	"github.com/briandowns/spinner"
	"github.com/fatih/color"
	"golang.org/x/mod/semver"
)

const (
	PROD_INSTALL_URL = "https://install.serverless.com"
	DEV_INSTALL_URL  = "https://install.serverless-dev.com"
)

func createServerlessDirectoryIfNotExists() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Errorf("resolving home dir: %w", err))
	}
	if _, err := os.Stat(fmt.Sprintf("%s/.serverless/binaries", homeDir)); os.IsNotExist(err) {
		err = os.MkdirAll(fmt.Sprintf("%s/.serverless/binaries", homeDir), 0755)
		if err != nil {
			panic(fmt.Errorf("creating binaries directory: %w", err))
		}
	}
}

func getConfigPathFromArgs(args []string) (string, bool) {
	for i, arg := range args {
		if arg == "--" {
			break
		}
		switch {
		case arg == "--config":
			if i+1 < len(args) {
				return args[i+1], true
			}
		case strings.HasPrefix(arg, "--config="):
			return strings.TrimPrefix(arg, "--config="), true
		case arg == "-c":
			if i+1 < len(args) {
				return args[i+1], true
			}
		case strings.HasPrefix(arg, "-c="):
			return strings.TrimPrefix(arg, "-c="), true
		}
	}
	return "", false
}

func resolveConfigFilePath(args []string) string {
	if configPath, ok := getConfigPathFromArgs(args); ok {
		if configPath == "" {
			return getLocalServerlessConfigFilePath()
		}
		if strings.HasPrefix(configPath, "~"+string(os.PathSeparator)) {
			if homeDir, err := os.UserHomeDir(); err == nil {
				configPath = filepath.Join(homeDir, configPath[2:])
			}
		}
		if !filepath.IsAbs(configPath) {
			if cwd, err := os.Getwd(); err == nil {
				configPath = filepath.Join(cwd, configPath)
			}
		}
		configPath = filepath.Clean(configPath)
		if info, err := os.Stat(configPath); err == nil {
			if info.IsDir() {
				return getLocalServerlessConfigFilePath()
			}
			return configPath
		}
		return getLocalServerlessConfigFilePath()
	}
	return getLocalServerlessConfigFilePath()
}

func shouldCheckForUpdates() bool {
	if isUpdateCommand() {
		return true
	}

	if _, isSet := os.LookupEnv("SERVERLESS_FRAMEWORK_FORCE_UPDATE"); isSet {
		return true
	}

	return false
}

func isNodeUpToDate() bool {
	cmd := exec.Command("node", "--version")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	outputStr := strings.TrimSpace(string(output))

	re := regexp.MustCompile(`^v(\d+)\.\d+\.\d+`)
	matches := re.FindStringSubmatch(outputStr)

	if len(matches) < 2 {
		return false
	}

	majorVersion, err := strconv.Atoi(matches[1])
	if err != nil || majorVersion < 18 {
		return false
	}

	return true
}

func doesNodeExistAndIsItAccessible() bool {
	if _, err := exec.LookPath("node"); err != nil {
		return false
	}

	if _, err := exec.LookPath("npm"); err != nil {
		return false
	}
	return true
}

type PackageJson struct {
	Version         string            `json:"version"`
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
}

func runLocalVersionIfAvailable() {
	// In V4 all versions are global and versions will be eventually pinned and used from the global set of versions.
	// However users expect that a global serverless version can use a locally installed one, i.e. in the package.json.
	// For now we need to support locally installed v3 instances from the global v4 install.

	// 1. First check if node_modules/serverless/bin/serverless.js and node_modules/serverless/package.json exists
	// 2. Check node_modules/serverless/package.json version is equal to v3 or lower
	// 3. Check if package.json contains serverless v3 or lower as a dependency

	cwd, err := os.Getwd()
	if err != nil {
		return
	}
	fullPathToBinScript := filepath.Join(cwd, "node_modules/serverless/bin/serverless.js")
	fullPathToPackageJson := filepath.Join(cwd, "node_modules/serverless/package.json")
	localPackageJson := filepath.Join(cwd, "package.json")

	_, err = os.Stat(fullPathToBinScript)
	if os.IsNotExist(err) {
		return
	}
	_, err = os.Stat(fullPathToPackageJson)
	if os.IsNotExist(err) {
		return
	}
	_, err = os.Stat(localPackageJson)
	if os.IsNotExist(err) {
		return
	}

	b, err := os.ReadFile(localPackageJson)
	if err != nil {
		// Really shouldn't be possible
		return
	}

	var packageJson PackageJson
	err = json.Unmarshal(b, &packageJson)
	if err != nil {
		return
	}

	if ver, exists := packageJson.DevDependencies["serverless"]; exists {
		if semver.Compare(ver, "v4.0.0") >= 0 {
			return
		}
	} else {
		return
	}

	args := os.Args[1:]

	args = append([]string{fullPathToBinScript}, args...)

	cmd := exec.Command("node", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()

	if err := cmd.Start(); err != nil {
		panic(fmt.Errorf("starting node: %w", err))
	}

	if err := cmd.Wait(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			os.Exit(exitErr.ExitCode())
		}
		panic(fmt.Errorf("node process wait: %w", err))
	}

	os.Exit(0)
}

func getBinaryName() string {
	osType := runtime.GOOS
	architecture := runtime.GOARCH

	// Check for supported architectures
	if architecture != "arm64" && architecture != "amd64" {
		fmt.Fprintf(os.Stderr, "Architecture %s is not supported.\n", architecture)
		os.Exit(1)
	}

	// Check for unsupported OS-architecture combinations
	if architecture == "arm64" && osType == "windows" {
		fmt.Fprintf(os.Stderr, "Platform %s - %s is not supported.\n", osType, architecture)
		os.Exit(1)
	}

	// getInstallBaseUrl is conditionally compiled based on build tags
	// The implementation is in install_base_url.go and install_base_url_canary.go

	baseUrl := getInstallBaseUrl()
	return fmt.Sprintf("%s/installer-builds/serverless-%s-%s", baseUrl, osType, architecture)
}

func updateInstaller() {
	useSpinner := !version.IsCIEnvironment()
	var updateSpinner *spinner.Spinner
	if useSpinner {
		updateSpinner = spinner.New(spinner.CharSets[14], 100*time.Millisecond)
		updateSpinner.Suffix = " Updating"
		updateSpinner.Color("red")
		updateSpinner.Start()
		defer func() {
			updateSpinner.Stop()
		}()
	} else {
		fmt.Fprintln(os.Stderr, "Updating installer...")
	}
	// Get the correct binary name based on OS and architecture
	binaryName := getBinaryName()
	client := http.Client{Timeout: 2 * time.Minute}
	// Download the latest installer
	response, err := client.Get(binaryName)
	if err != nil {
		panic(fmt.Errorf("downloading installer from %s: %w", binaryName, err))
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		limited := io.LimitReader(response.Body, 2048)
		b, _ := io.ReadAll(limited)
		panic(fmt.Errorf("installer download failed: GET %s returned %s; body: %s", binaryName, response.Status, strings.TrimSpace(string(b))))
	}

	// Get the path of the current executable
	name, err := os.Executable()
	if err != nil {
		panic(fmt.Errorf("locating executable: %w", err))
	}
	name, err = filepath.EvalSymlinks(name)
	if err != nil {
		panic(fmt.Errorf("resolving executable symlink: %w", err))
	}
	newName := name + ".new"
	oldName := name + ".old"
	// Create a new file to write the downloaded installer
	out, err := os.OpenFile(newName, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		panic(fmt.Errorf("creating temp installer %s: %w", newName, err))
	}
	// Write the downloaded installer to .new file
	_, err = io.Copy(out, response.Body)
	if err != nil {
		panic(fmt.Errorf("writing temp installer %s: %w", newName, err))
	}
	// Remove the .old (from the last update) if it exists
	if _, err := os.Stat(oldName); err == nil {
		if err := os.Remove(oldName); err != nil {
			panic(fmt.Errorf("removing old installer %s: %w", oldName, err))
		}
	}
	// Rename the current executable to .old
	if err := os.Rename(name, oldName); err != nil {
		panic(fmt.Errorf("renaming %s to %s: %w", name, oldName, err))
	}

	// Close the file to avoid "The process cannot access the file because it is being used by another process." error
	out.Close()

	// Rename the .new installer to the current executable
	if err := os.Rename(newName, name); err != nil {
		panic(fmt.Errorf("renaming %s to %s: %w", newName, name, err))
	}
	if !useSpinner {
		fmt.Fprintln(os.Stderr, "Installer update complete")
	}
}

func getLocalServerlessConfigFilePath() string {
	supportedFilenames := []string{"serverless", "serverless-compose", "serverless.containers", "serverless.ai"}
	supportedExtensions := []string{"yml", "yaml", "js", "ts", "cjs", "mjs", "json"}
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	// Check if the current working directory contains a supported serverless config file
	for _, baseName := range supportedFilenames {
		for _, extension := range supportedExtensions {
			filePath := filepath.Join(cwd, baseName+"."+extension)
			if _, err := os.Stat(filePath); err == nil {
				return filePath
			}
		}
	}

	return ""
}

func main() {
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "Error: %s\n", r)
			os.Exit(1)
		}
	}()

	if value, ok := os.LookupEnv("SLS_DISABLE_EXTRA_CA_CERTS"); ok && value != "false" {
		// Configure HTTP clients to honor extra CA certs from env
		certs.ConfigureHTTPRootCAs()
	}

	createServerlessDirectoryIfNotExists()

	if isUpdateCommand() {
		updateInstaller()
	}

	runLocalVersionIfAvailable()

	args := os.Args[1:]

	configFilePath := resolveConfigFilePath(args)

	release, err := version.GetFrameworkVersion(configFilePath, shouldCheckForUpdates())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error getting framework version: %v\n", err)
		os.Exit(1)
	}

	if release == nil {
		fmt.Fprintln(os.Stderr, "Could not find a valid version to run")
		os.Exit(1)
	}
	if ok := doesNodeExistAndIsItAccessible(); !ok {
		fmt.Fprintln(os.Stderr, "Nodejs is not installed, please install Nodejs and run the command again")
		os.Exit(1)
	}

	if ok := isNodeUpToDate(); !ok {
		fmt.Fprintln(os.Stderr, "Your Nodejs version is too old, please upgrade to Node 18 or newer and rerun Serverless")
		os.Exit(1)
	}
	if isUpdateCommand() {
		fmt.Printf("✔ Update completed\n")
		if release.LatestVersion != nil && *release.LatestVersion != release.Version {
			color.Yellow(fmt.Sprintf("A new version, %s, has been released. Update your `frameworkVersion` property to use it", *release.LatestVersion))
		}
		return
	}

	enableSourcemaps := false
	for _, arg := range args {
		if arg == "--debug" {
			enableSourcemaps = true
		}
	}

	args = append([]string{filepath.Join(release.ReleasePath, "package/dist/sf-core.js")}, args...)

	cmd := exec.Command("node", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = os.Environ()

	if enableSourcemaps {
		cmd.Env = append(cmd.Env, "NODE_OPTIONS=--enable-source-maps")
	}

	if err := cmd.Start(); err != nil {
		panic(fmt.Errorf("starting node: %w", err))
	}

	// Ignore SIGINT and SIGTERM signals to prevent Go from exiting before the child Node process
	// The child Node process has the same process group as the Go process, so it will receive the signals as well
	// and handle them accordingly. We're not using signal.Ignore because the process does not have permission to ignore CTRL+C.
	// signal.Ignore(os.Interrupt) does nothing - Windows will still terminate the process when CTRL+C is pressed.
	// Instead we're using signal.Notify which explicitly registers a console control handler.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, os.Interrupt)
	go func() {
		<-sigs // Needed to discard signals
	}()

	if err := cmd.Wait(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			os.Exit(exitErr.ExitCode())
		}
		panic(fmt.Errorf("node process wait: %w", err))
	}
}

func isUpdateCommand() bool {
	return len(os.Args) >= 2 && os.Args[1] == "update"
}
