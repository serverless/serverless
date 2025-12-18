package version

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
