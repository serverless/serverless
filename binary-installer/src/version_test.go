package version

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"sf-core/src/metadata"
)

func TestGetVersionsFile_UsesMetadataThrottling(t *testing.T) {

	// httptest server returning versions.json
	netCalls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		netCalls++
		_, _ = w.Write([]byte(`{"blockedVersions": [], "supportedVersions": ["4.0.0"]}`))
	}))
	defer ts.Close()

	// Prepare cache in temp HOME
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	cachePath := filepath.Join(cacheDir, "versions.json")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(cachePath, []byte(`{"blockedVersions": [], "supportedVersions": ["3.9.9"]}`), 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}

	// Write fresh metadata to throttle
	metadata.WriteLocalMetadata("4.0.0")

	// Call getVersionsFile (should use cache and avoid network)
	// Call the parameterized helper directly with the server URL
	vf, err := getVersionsFileWithURL(ts.URL, false)
	if err != nil || vf == nil {
		t.Fatalf("getVersionsFile: %v", err)
	}
	if netCalls != 0 {
		t.Fatalf("expected no network calls when metadata is fresh, got %d", netCalls)
	}

	// Now simulate stale metadata and ensure one network call occurs
	old := time.Now().Add(-25 * time.Hour).Format(time.RFC3339Nano)
	metaPath := filepath.Join(tempHome, ".serverless", "binaries", "metadata.json")
	_ = os.MkdirAll(filepath.Dir(metaPath), 0o755)
	_ = os.WriteFile(metaPath, []byte(fmt.Sprintf(`{"version":"%s","updateLastChecked":"%s"}`, "4.0.0", old)), 0o644)
	_ = os.Remove(cachePath) // force fetch path
	// Next call should hit network once (cache missing and metadata stale)
	ts.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		netCalls++
		_, _ = w.Write([]byte(`{"blockedVersions": [], "supportedVersions": ["4.0.1"]}`))
	})
	// Clear metadata by writing an old timestamp using direct write
	// Simpler: unset CI to allow parsing flow, but metadata freshness is checked inside readVersionsFromCache
	// Here we rely on cachePath removal to force a fetch; netCalls should increment
	vf, err = getVersionsFileWithURL(ts.URL, false)
	if err != nil || vf == nil {
		t.Fatalf("getVersionsFile (stale): %v", err)
	}
	if netCalls < 1 {
		t.Fatalf("expected at least one network call when cache missing/stale, got %d", netCalls)
	}
}

func TestGetVersionsFileWithURL_ForceBypassCache(t *testing.T) {
	// Fresh metadata but force=true should bypass cache and hit network
	netCalls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		netCalls++
		_, _ = w.Write([]byte(`{"blockedVersions": [], "supportedVersions": ["4.9.9"]}`))
	}))
	defer ts.Close()

	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Write any cache content; it should be ignored
	_ = os.WriteFile(filepath.Join(cacheDir, "versions.json"), []byte(`{"blockedVersions":[],"supportedVersions":["1.0.0"]}`), 0o644)
	metadata.WriteLocalMetadata("1.0.0") // fresh metadata
	before := metadata.GetLocalMetadata()

	vf, err := getVersionsFileWithURL(ts.URL, true)
	if err != nil || vf == nil {
		t.Fatalf("getVersionsFileWithURL(force): %v", err)
	}
	if netCalls == 0 {
		t.Fatalf("expected network call when force=true")
	}
	// Assert updateLastChecked increased
	after := metadata.GetLocalMetadata()
	if before == nil || after == nil || !after.UpdateLastChecked.After(before.UpdateLastChecked) {
		t.Fatalf("expected updateLastChecked bump after index fetch")
	}
}

// removed meaningless test

func TestFetchURL_Non200(t *testing.T) {
	ts2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("teapot"))
	}))
	defer ts2.Close()

	if _, err := fetchURL(ts2.URL); err == nil {
		t.Fatalf("expected error on non-200 status, got nil")
	}
}

func TestFetchURL_NetworkError(t *testing.T) {
	// Use an unroutable address/port to force connection error
	if _, err := fetchURL("http://127.0.0.1:1/"); err == nil {
		t.Fatalf("expected network error, got nil")
	}
}

func TestGetVersion_Table(t *testing.T) {
	// Prepare cached versions.json in temp HOME and fresh metadata
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	// versions where 4.0.0 is blocked and 4.1.0 is latest
	body := []byte(`{"blockedVersions":["4.0.0"],"supportedVersions":["3.9.0","4.0.0","4.1.0"]}`)
	if err := os.WriteFile(cachePath, body, 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.1.0")

	tests := []struct{ name, constraint, want string }{
		{"exact", "4.1.0", "4.1.0"},
		{"range", "^4.0.0", "4.1.0"},
		{"blockedExact", "4.0.0", "4.0.0"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res, err := getVersion(tc.constraint, false)
			if err != nil {
				t.Fatalf("getVersion: %v", err)
			}
			if res.matchedVersion != tc.want {
				t.Fatalf("want %s, got %s", tc.want, res.matchedVersion)
			}
		})
	}
}

func TestGetVersion_NoConstraint_WarningFlag(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("CI", "0")
	// cache with supported versions
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	body := []byte(`{"blockedVersions":[],"supportedVersions":["4.0.0","4.2.0"]}`)
	if err := os.WriteFile(cachePath, body, 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.2.0")

	// Non-CI: shouldPrintAutoUpdateWarning=false
	res, err := getVersion("", false)
	if err != nil {
		t.Fatalf("getVersion: %v", err)
	}
	if res.matchedVersion != "4.2.0" || res.shouldPrintAutoUpdateWarning {
		t.Fatalf("unexpected result: %+v", res)
	}

	// CI=true: shouldPrintAutoUpdateWarning=true
	t.Setenv("CI", "1")
	res, err = getVersion("", false)
	if err != nil {
		t.Fatalf("getVersion(CI): %v", err)
	}
	if res.matchedVersion != "4.2.0" || !res.shouldPrintAutoUpdateWarning {
		t.Fatalf("unexpected result in CI: %+v", res)
	}
}

func TestGetVersion_InvalidConstraint(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	body := []byte(`{"blockedVersions":[],"supportedVersions":["4.1.0"]}`)
	if err := os.WriteFile(cachePath, body, 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.1.0")

	if _, err := getVersion("not-a-constraint", false); err == nil {
		t.Fatalf("expected error for invalid constraint")
	}
}

func TestGetVersionsFileWithURL_ParseErrorFallsBack(t *testing.T) {
	// Fresh metadata, but server returns invalid JSON; should fall back to cache if present
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	if err := os.WriteFile(cachePath, []byte(`{"blockedVersions":[],"supportedVersions":["4.1.0"]}`), 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	// Make metadata stale so code tries network then falls back
	old := time.Now().Add(-25 * time.Hour).Format(time.RFC3339Nano)
	metaPath := filepath.Join(tempHome, ".serverless", "binaries", "metadata.json")
	_ = os.WriteFile(metaPath, []byte(fmt.Sprintf(`{"version":"%s","updateLastChecked":"%s"}`, "4.1.0", old)), 0o644)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("not-json"))
	}))
	defer ts.Close()

	vf, err := getVersionsFileWithURL(ts.URL, false)
	if err != nil || vf == nil {
		t.Fatalf("expected fallback to cache, got err=%v", err)
	}
	if len(vf.SupportedVersions) != 1 || vf.SupportedVersions[0] != "4.1.0" {
		t.Fatalf("unexpected cached versions: %+v", vf)
	}
}

func TestGetVersionsFileWithURL_FetchErrorNoCache(t *testing.T) {
	// Metadata stale, no cache present, and network fails -> expect error
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	old := time.Now().Add(-25 * time.Hour).Format(time.RFC3339Nano)
	metaPath := filepath.Join(tempHome, ".serverless", "binaries", "metadata.json")
	_ = os.MkdirAll(filepath.Dir(metaPath), 0o755)
	_ = os.WriteFile(metaPath, []byte(fmt.Sprintf(`{"version":"%s","updateLastChecked":"%s"}`, "4.1.0", old)), 0o644)

	if _, err := getVersionsFileWithURL("http://127.0.0.1:1/", false); err == nil {
		t.Fatalf("expected error when network fails and no cache exists")
	}
}

func TestFindClosestMatch_Errors(t *testing.T) {
	// invalid constraint
	if _, err := findClosestMatch([]string{"4.1.0"}, "bad"); err == nil {
		t.Fatalf("expected error for invalid constraint")
	}
	// invalid version in list
	if _, err := findClosestMatch([]string{"not-a-version", "4.1.0"}, "^4.0.0"); err == nil {
		t.Fatalf("expected error for invalid version in list")
	}
	// no match in list
	if _, err := findClosestMatch([]string{"3.9.0"}, "^4.0.0"); err == nil {
		t.Fatalf("expected error for no matching version")
	}
}

func TestGetMostRecentCanaryVersionWithBaseURL_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/releases.json" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{"version":"9.9.9"}`))
	}))
	defer ts.Close()
	v, err := getMostRecentCanaryVersionWithBaseURL(ts.URL)
	if err != nil || v != "9.9.9" {
		t.Fatalf("unexpected: v=%s err=%v", v, err)
	}
}

func TestGetFrameworkVersion_Stable_NoNetwork(t *testing.T) {
	// Prepare a fake installed stable release and versions cache
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	// Pre-create release dir to avoid download
	rel := filepath.Join(tempHome, ".serverless", "releases", "4.1.0", "package", "dist")
	if err := os.MkdirAll(rel, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rel, "sf-core.js"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	// versions cache says 4.1.0 latest
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	_ = os.MkdirAll(cacheDir, 0o755)
	_ = os.WriteFile(filepath.Join(cacheDir, "versions.json"), []byte(`{"blockedVersions":[],"supportedVersions":["4.1.0"]}`), 0o644)
	// Writing local metadata updates updateLastChecked and should modify the file
	metadata.WriteLocalMetadata("4.1.0")

	// Write a minimal YAML config file with exact version
	cfg := filepath.Join(tempHome, "serverless.yml")
	_ = os.WriteFile(cfg, []byte("frameworkVersion: 4.1.0\n"), 0o644)

	fr, err := GetFrameworkVersion(cfg, false)
	if err != nil || fr == nil {
		t.Fatalf("GetFrameworkVersion: %v", err)
	}
	if string(fr.Version) != "4.1.0" {
		t.Fatalf("expected 4.1.0, got %s", fr.Version)
	}
	if _, statErr := os.Stat(filepath.Join(fr.ReleasePath, "package", "dist", "sf-core.js")); statErr != nil {
		t.Fatalf("expected precreated sf-core.js at %s", fr.ReleasePath)
	}
}

func TestGetFrameworkVersion_PinnedCanary_NoNetwork(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	// Pre-create pinned canary release dir
	rel := filepath.Join(tempHome, ".serverless", "releases", "canary-1.2.3", "package", "dist")
	if err := os.MkdirAll(rel, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rel, "sf-core.js"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := filepath.Join(tempHome, "serverless.yml")
	_ = os.WriteFile(cfg, []byte("frameworkVersion: canary-1.2.3\n"), 0o644)

	fr, err := GetFrameworkVersion(cfg, false)
	if err != nil || fr == nil {
		t.Fatalf("GetFrameworkVersion canary: %v", err)
	}
	if string(fr.Version) != "canary-1.2.3" {
		t.Fatalf("expected canary-1.2.3, got %s", fr.Version)
	}
}

func TestValidateCanaryVersion(t *testing.T) {
	valid := []string{
		"canary-1.2.3",
		"canary-4.39.0-rc.1",
		"canary-abc123def",
		"canary-a_b.c-d",
	}
	for _, v := range valid {
		if err := validateCanaryVersion(v); err != nil {
			t.Errorf("expected %q to be accepted, got error: %v", v, err)
		}
	}

	invalid := []string{
		"canary-../../../../sentinel",
		"canary-/etc",
		"canary-..",
		"canary-a/b",
		`canary-..\..\windows`,
		"canary-", // empty suffix
		"canary",  // bare canary is handled elsewhere, not by this validator
	}
	for _, v := range invalid {
		if err := validateCanaryVersion(v); err == nil {
			t.Errorf("expected %q to be rejected, got nil error", v)
		}
	}
}

func TestGetFrameworkVersion_RejectsTraversingCanary(t *testing.T) {
	badVersions := []string{
		"canary-../../../../sentinel",
		"canary-/etc",
		"canary-..",
		"canary-a/b",
		`canary-..\..\windows`,
	}
	for _, v := range badVersions {
		t.Run(v, func(t *testing.T) {
			tempHome := t.TempDir()
			t.Setenv("HOME", tempHome)

			cfg := filepath.Join(tempHome, "serverless.yml")
			if err := os.WriteFile(cfg, []byte("frameworkVersion: '"+v+"'\n"), 0o644); err != nil {
				t.Fatal(err)
			}

			if _, err := GetFrameworkVersion(cfg, false); err == nil {
				t.Fatalf("expected error for version %q, got nil", v)
			}
		})
	}
}

func TestContainedReleasePath(t *testing.T) {
	releasesDir := filepath.Join(t.TempDir(), ".serverless", "releases")

	// Valid versions resolve to a path inside releasesDir.
	for _, v := range []string{"4.1.0", "canary-1.2.3"} {
		got, err := containedReleasePath(releasesDir, v)
		if err != nil {
			t.Errorf("expected %q to be contained, got error: %v", v, err)
			continue
		}
		want := filepath.Join(releasesDir, v)
		if got != want {
			t.Errorf("version %q: want path %q, got %q", v, want, got)
		}
	}

	// Traversing, nested, or absolute versions are rejected before any path is used.
	for _, v := range []string{
		"canary-../../../../sentinel",
		"..",
		"../escape",
		"a/../../escape",
		"a/b", // nested: only a direct child is allowed
		"",    // empty resolves to releasesDir itself
	} {
		if _, err := containedReleasePath(releasesDir, v); err == nil {
			t.Errorf("expected %q to be rejected, got nil error", v)
		}
	}
}

func TestGetMostRecentCanaryVersionWithBaseURL_Non200(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("nope"))
	}))
	defer ts.Close()
	if _, err := getMostRecentCanaryVersionWithBaseURL(ts.URL); err == nil {
		t.Fatalf("expected error on non-200")
	}
}

func TestGetMostRecentCanaryVersionWithBaseURL_InvalidJSON(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("not-json"))
	}))
	defer ts.Close()
	if _, err := getMostRecentCanaryVersionWithBaseURL(ts.URL); err == nil {
		t.Fatalf("expected JSON parse error")
	}
}

func TestGetVersionsFileWithURL_CorruptedCache_ThenFetch(t *testing.T) {
	// Fresh metadata but corrupted cache JSON; ensure it fetches instead of returning cache
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	// write corrupted JSON
	if err := os.WriteFile(cachePath, []byte("{"), 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.0.0")

	netCalls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		netCalls++
		_, _ = w.Write([]byte(`{"blockedVersions":[],"supportedVersions":["4.5.6"]}`))
	}))
	defer ts.Close()

	vf, err := getVersionsFileWithURL(ts.URL, false)
	if err != nil || vf == nil {
		t.Fatalf("getVersionsFileWithURL: %v", err)
	}
	if netCalls == 0 {
		t.Fatalf("expected network call when cache corrupted")
	}
}

// Edge case: getVersion with empty supportedVersions should error
func TestGetVersion_NoSupportedVersions(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	cachePath := filepath.Join(cacheDir, "versions.json")
	if err := os.WriteFile(cachePath, []byte(`{"blockedVersions":[],"supportedVersions":[]}`), 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.0.0")
	if _, err := getVersion("", false); err == nil {
		t.Fatalf("expected error when no supported versions available")
	}
}

// --- Unit tests for bundled archive helpers ---

func TestArchiveHasDependencies_WithDeps(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "package.json"),
		[]byte(`{"dependencies":{"esbuild":"0.27.3"}}`), 0o644)

	has, err := archiveHasDependencies(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !has {
		t.Fatal("expected true for archive with dependencies")
	}
}

func TestArchiveHasDependencies_EmptyDeps(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "package.json"),
		[]byte(`{"dependencies":{}}`), 0o644)

	has, err := archiveHasDependencies(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if has {
		t.Fatal("expected false for archive with empty dependencies")
	}
}

func TestArchiveHasDependencies_NoDepsField(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "package.json"),
		[]byte(`{"name":"test"}`), 0o644)

	has, err := archiveHasDependencies(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if has {
		t.Fatal("expected false when dependencies field is absent")
	}
}

func TestCleanupUnusedEsbuildBinaries(t *testing.T) {
	esbuildDir := filepath.Join(t.TempDir(), "@esbuild")

	platforms := []string{"darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"}
	for _, p := range platforms {
		dir := filepath.Join(esbuildDir, p, "bin")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(filepath.Join(dir, "esbuild"), []byte("binary"), 0o755)
	}

	cleanupUnusedEsbuildBinaries(esbuildDir)

	currentPlatform := esbuildPlatformDir()
	if currentPlatform == "" {
		t.Skip("unsupported platform")
	}

	entries, err := os.ReadDir(esbuildDir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}

	if len(entries) != 1 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("expected 1 remaining dir, got %d: %v", len(entries), names)
	}
	if entries[0].Name() != currentPlatform {
		t.Fatalf("expected %s to remain, got %s", currentPlatform, entries[0].Name())
	}
}

// =============================================================================
// bundled archive compatibility matrix tests
//
// Four scenarios for binary installer ↔ archive compatibility:
//
//   Old Go binary + Old archive  → npm install runs (pre-existing behavior)
//   Old Go binary + New archive  → npm install is a no-op (empty deps)
//   New Go binary + Old archive  → archiveHasDependencies=true → npm install
//   New Go binary + New archive  → archiveHasDependencies=false → skip, cleanup
//
// The "old Go binary" always runs npm install unconditionally, so its behavior
// is determined entirely by the archive contents. The new Go binary uses
// archiveHasDependencies() to decide, then cleanupUnusedEsbuildBinaries().
// =============================================================================

var allEsbuildPlatforms = []string{
	"darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64",
}

// createOldArchive builds a temp directory that looks like an extracted old-style
// archive: package.json has real dependencies, no dist/node_modules/.
func createOldArchive(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "package")
	if err := os.MkdirAll(filepath.Join(root, "dist"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(root, "dist", "sf-core.js"), []byte("// bundle"), 0o644)
	_ = os.WriteFile(filepath.Join(root, "package.json"), []byte(`{
  "name": "@serverlessinc/framework-alpha",
  "version": "4.3.3",
  "dependencies": {
    "@aws-sdk/client-cloudfront-keyvaluestore": "3.1017.0",
    "@aws-sdk/signature-v4-crt": "3.1017.0",
    "@aws-sdk/signature-v4a": "3.1009.0",
    "ajv": "8.18.0",
    "ajv-formats": "3.0.1",
    "esbuild": "0.27.4"
  }
}`), 0o644)
	return root
}

// createNewArchive builds a temp directory that looks like an extracted new-style
// (bundled archive) archive: no dependencies, esbuild binaries + ajv runtime files
// shipped in dist/node_modules/.
func createNewArchive(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "package")
	if err := os.MkdirAll(filepath.Join(root, "dist"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(root, "dist", "sf-core.js"), []byte("// bundle"), 0o644)
	_ = os.WriteFile(filepath.Join(root, "package.json"), []byte(`{
  "name": "@serverlessinc/framework-alpha",
  "version": "4.4.0",
  "dependencies": {}
}`), 0o644)

	// Create esbuild platform binaries for all 5 platforms
	for _, p := range allEsbuildPlatforms {
		var binPath string
		if p == "win32-x64" {
			binPath = filepath.Join(root, "dist", "node_modules", "@esbuild", p, "esbuild.exe")
		} else {
			binPath = filepath.Join(root, "dist", "node_modules", "@esbuild", p, "bin", "esbuild")
		}
		if err := os.MkdirAll(filepath.Dir(binPath), 0o755); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(binPath, []byte("#!/fake/esbuild"), 0o755)
	}

	// Create ajv runtime files
	for _, dir := range []string{
		"ajv/dist/runtime",
		"ajv-formats/dist",
		"fast-deep-equal",
	} {
		if err := os.MkdirAll(filepath.Join(root, "dist", "node_modules", dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	distNM := filepath.Join(root, "dist", "node_modules")
	_ = os.WriteFile(filepath.Join(distNM, "ajv", "package.json"), []byte(`{"name":"ajv"}`), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "ajv", "dist", "runtime", "equal.js"), []byte("// equal"), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "ajv", "dist", "runtime", "ucs2length.js"), []byte("// ucs2"), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "ajv-formats", "package.json"), []byte(`{"name":"ajv-formats"}`), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "ajv-formats", "dist", "formats.js"), []byte("// formats"), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "fast-deep-equal", "package.json"), []byte(`{"name":"fast-deep-equal"}`), 0o644)
	_ = os.WriteFile(filepath.Join(distNM, "fast-deep-equal", "index.js"), []byte("// equal"), 0o644)

	return root
}

// esbuildPlatformDirs returns the set of @esbuild/<platform> directories present
// under the given dist/node_modules/@esbuild path.
func esbuildPlatformDirs(esbuildDir string) []string {
	entries, err := os.ReadDir(esbuildDir)
	if err != nil {
		return nil
	}
	var dirs []string
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e.Name())
		}
	}
	return dirs
}

// --- Scenario 1: Old Go binary + Old archive ---
// The old binary always runs npm install. We verify that the archive has deps,
// meaning npm install would actually install packages (not a no-op).

func TestCompat_OldBinary_OldArchive(t *testing.T) {
	packageDir := createOldArchive(t)

	// The old Go binary doesn't call archiveHasDependencies — it always runs
	// npm install. We verify the archive IS the old format (has dependencies),
	// so npm install would install the 6 packages.
	hasDeps, err := archiveHasDependencies(packageDir)
	if err != nil {
		t.Fatalf("archiveHasDependencies: %v", err)
	}
	if !hasDeps {
		t.Fatal("old archive should report dependencies present")
	}

	// Verify: no dist/node_modules/ exists (old archive doesn't ship them)
	esbuildDir := filepath.Join(packageDir, "dist", "node_modules", "@esbuild")
	if _, err := os.Stat(esbuildDir); !os.IsNotExist(err) {
		t.Fatal("old archive should NOT have dist/node_modules/@esbuild/")
	}
}

// --- Scenario 2: Old Go binary + New archive ---
// The old binary still runs npm install, but with empty deps it's a no-op.
// The esbuild binaries are already shipped in dist/node_modules/.

func TestCompat_OldBinary_NewArchive(t *testing.T) {
	packageDir := createNewArchive(t)

	// The old Go binary doesn't call archiveHasDependencies — it always runs
	// npm install. We verify the archive has no deps, so npm install is a no-op.
	hasDeps, err := archiveHasDependencies(packageDir)
	if err != nil {
		t.Fatalf("archiveHasDependencies: %v", err)
	}
	if hasDeps {
		t.Fatal("new archive should report no dependencies")
	}

	// Verify: all 5 esbuild platform binaries are present (shipped in archive)
	esbuildDir := filepath.Join(packageDir, "dist", "node_modules", "@esbuild")
	dirs := esbuildPlatformDirs(esbuildDir)
	if len(dirs) != 5 {
		t.Fatalf("expected 5 esbuild platform dirs, got %d: %v", len(dirs), dirs)
	}

	// Verify: ajv runtime files are present
	for _, file := range []string{
		"ajv/dist/runtime/equal.js",
		"ajv/dist/runtime/ucs2length.js",
		"ajv-formats/dist/formats.js",
		"fast-deep-equal/index.js",
	} {
		p := filepath.Join(packageDir, "dist", "node_modules", file)
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("missing ajv runtime file %s: %v", file, err)
		}
	}

	// After the old binary's npm install (no-op), all 5 binaries remain
	// untouched — old binary has no cleanup logic. Verify they're still there.
	dirsAfter := esbuildPlatformDirs(esbuildDir)
	if len(dirsAfter) != 5 {
		t.Fatalf("old binary should not remove any platform dirs, got %d: %v", len(dirsAfter), dirsAfter)
	}
}

// --- Scenario 3: New Go binary + Old archive ---
// The new binary reads package.json, finds dependencies → runs npm install.
// No esbuild cleanup needed (old archive has no dist/node_modules/@esbuild/).

func TestCompat_NewBinary_OldArchive(t *testing.T) {
	packageDir := createOldArchive(t)

	// New binary checks archiveHasDependencies → true → npm install path
	hasDeps, err := archiveHasDependencies(packageDir)
	if err != nil {
		t.Fatalf("archiveHasDependencies: %v", err)
	}
	if !hasDeps {
		t.Fatal("old archive should trigger npm install path")
	}

	// The new binary would run npm install here. We can't run npm in tests,
	// but we verify the decision is correct.

	// Verify: dist/node_modules/@esbuild doesn't exist (old archive)
	esbuildDir := filepath.Join(packageDir, "dist", "node_modules", "@esbuild")
	if _, err := os.Stat(esbuildDir); !os.IsNotExist(err) {
		t.Fatal("old archive should not have dist/node_modules/@esbuild/")
	}

	// cleanupUnusedEsbuildBinaries should be a no-op (dir doesn't exist)
	cleanupUnusedEsbuildBinaries(esbuildDir) // should not panic
}

// --- Scenario 4: New Go binary + New archive ---
// The new binary reads package.json, finds no deps → skips npm install,
// cleans up 4 unused esbuild platform binaries.

func TestCompat_NewBinary_NewArchive(t *testing.T) {
	currentPlatform := esbuildPlatformDir()
	if currentPlatform == "" {
		t.Skipf("unsupported platform: %s-%s", runtime.GOOS, runtime.GOARCH)
	}

	packageDir := createNewArchive(t)

	// New binary checks archiveHasDependencies → false → skip npm install
	hasDeps, err := archiveHasDependencies(packageDir)
	if err != nil {
		t.Fatalf("archiveHasDependencies: %v", err)
	}
	if hasDeps {
		t.Fatal("new archive should skip npm install path")
	}

	// Verify: all 5 platforms present before cleanup
	esbuildDir := filepath.Join(packageDir, "dist", "node_modules", "@esbuild")
	dirsBefore := esbuildPlatformDirs(esbuildDir)
	if len(dirsBefore) != 5 {
		t.Fatalf("expected 5 platforms before cleanup, got %d: %v", len(dirsBefore), dirsBefore)
	}

	// New binary runs cleanup
	cleanupUnusedEsbuildBinaries(esbuildDir)

	// Verify: only the current platform remains
	dirsAfter := esbuildPlatformDirs(esbuildDir)
	if len(dirsAfter) != 1 {
		t.Fatalf("expected 1 platform after cleanup, got %d: %v", len(dirsAfter), dirsAfter)
	}
	if dirsAfter[0] != currentPlatform {
		t.Fatalf("expected %s to remain, got %s", currentPlatform, dirsAfter[0])
	}

	// Verify: the kept platform's binary still exists
	var expectedBinary string
	if currentPlatform == "win32-x64" {
		expectedBinary = filepath.Join(esbuildDir, currentPlatform, "esbuild.exe")
	} else {
		expectedBinary = filepath.Join(esbuildDir, currentPlatform, "bin", "esbuild")
	}
	if _, err := os.Stat(expectedBinary); err != nil {
		t.Fatalf("current platform binary should still exist at %s: %v", expectedBinary, err)
	}

	// Verify: ajv runtime files are untouched by cleanup
	for _, file := range []string{
		"ajv/dist/runtime/equal.js",
		"ajv/dist/runtime/ucs2length.js",
		"ajv-formats/dist/formats.js",
		"fast-deep-equal/index.js",
		"ajv/package.json",
		"ajv-formats/package.json",
		"fast-deep-equal/package.json",
	} {
		p := filepath.Join(packageDir, "dist", "node_modules", file)
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("ajv file should be untouched after cleanup: %s: %v", file, err)
		}
	}

	// Verify: disk space saved — removed dirs should not exist
	for _, p := range allEsbuildPlatforms {
		if p == currentPlatform {
			continue
		}
		removedDir := filepath.Join(esbuildDir, p)
		if _, err := os.Stat(removedDir); !os.IsNotExist(err) {
			t.Fatalf("platform %s should have been removed, but still exists", p)
		}
	}
}

// --- archiveHasDependencies edge cases ---

func TestArchiveHasDependencies_MissingFile(t *testing.T) {
	dir := t.TempDir()
	has, err := archiveHasDependencies(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if has {
		t.Fatal("expected false (skip npm install) when package.json missing — npm install would fail anyway")
	}
}

func TestArchiveHasDependencies_MalformedJSON(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "package.json"),
		[]byte(`{not valid json`), 0o644)
	_, err := archiveHasDependencies(dir)
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

// --- esbuildPlatformDir ---

func TestEsbuildPlatformDir(t *testing.T) {
	dir := esbuildPlatformDir()
	if dir == "" {
		t.Skipf("unsupported platform: %s-%s", runtime.GOOS, runtime.GOARCH)
	}
	if !validEsbuildPlatforms[dir] {
		t.Fatalf("unexpected platform dir: %s", dir)
	}
}

// --- cleanupUnusedEsbuildBinaries edge cases ---

func TestCleanupUnusedEsbuildBinaries_MissingDir(t *testing.T) {
	cleanupUnusedEsbuildBinaries("/nonexistent/path")
}

func TestCleanupUnusedEsbuildBinaries_UnknownDirsUntouched(t *testing.T) {
	esbuildDir := filepath.Join(t.TempDir(), "@esbuild")

	// Create known platforms + an unknown directory
	for _, p := range append(allEsbuildPlatforms, "unknown-platform") {
		dir := filepath.Join(esbuildDir, p)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(filepath.Join(dir, "marker"), []byte("x"), 0o644)
	}

	cleanupUnusedEsbuildBinaries(esbuildDir)

	currentPlatform := esbuildPlatformDir()
	if currentPlatform == "" {
		t.Skip("unsupported platform")
	}

	// Unknown dir must survive cleanup (not in allowlist → not deleted)
	unknownDir := filepath.Join(esbuildDir, "unknown-platform")
	if _, err := os.Stat(unknownDir); err != nil {
		t.Fatalf("unknown-platform dir should NOT be deleted: %v", err)
	}

	// Current platform dir must survive
	if _, err := os.Stat(filepath.Join(esbuildDir, currentPlatform)); err != nil {
		t.Fatalf("current platform dir should survive: %v", err)
	}

	// Remaining: current platform + unknown = 2
	dirs := esbuildPlatformDirs(esbuildDir)
	if len(dirs) != 2 {
		t.Fatalf("expected 2 dirs (current + unknown), got %d: %v", len(dirs), dirs)
	}
}
