package version

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetMostRecentLocallyInstalledVersion_Basic(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	releases := filepath.Join(tempHome, ".serverless", "releases")
	if err := os.MkdirAll(filepath.Join(releases, "4.0.0"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(releases, "4.1.0"), 0o755); err != nil {
		t.Fatal(err)
	}
	v, err := getMostRecentLocallyInstalledVersion(nil)
	if err != nil || v == "" {
		t.Fatalf("unexpected: %s %v", v, err)
	}
}

func TestGetMostRecentLocallyInstalledVersion_NoVersions(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	if _, err := getMostRecentLocallyInstalledVersion(nil); err == nil {
		t.Fatalf("expected error when no releases present")
	}
}

func TestGetMostRecentLocallyInstalledVersion_Constraint(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	releases := filepath.Join(tempHome, ".serverless", "releases")
	_ = os.MkdirAll(filepath.Join(releases, "3.9.0"), 0o755)
	_ = os.MkdirAll(filepath.Join(releases, "4.1.0"), 0o755)
	c := "^3.0.0"
	v, err := getMostRecentLocallyInstalledVersion(&c)
	if err != nil || string(v) != "3.9.0" {
		t.Fatalf("constraint expected 3.9.0, got %s (%v)", v, err)
	}
}

func TestLocalReleaseFallback(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	releases := filepath.Join(tempHome, ".serverless", "releases")
	_ = os.MkdirAll(filepath.Join(releases, "4.2.0"), 0o755)
	ver := "^4.0.0"
	fr, err := localReleaseFallback(&ver)
	if err != nil || fr == nil || string(fr.Version) != "4.2.0" {
		t.Fatalf("localReleaseFallback failed: %#v (%v)", fr, err)
	}
}

func TestLocalReleaseFallback_NoReleases(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	ver := "^1.0.0"
	if _, err := localReleaseFallback(&ver); err == nil {
		t.Fatalf("expected error when no releases present")
	}
}

// The local-release fallback ignores directories that are not release
// versions: temporary directories of installs in progress, and canary builds.
func TestGetMostRecentLocallyInstalledVersion_IgnoresNonVersionDirectories(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	releases := filepath.Join(tempHome, ".serverless", "releases")
	for _, name := range []string{"4.1.0", ".4.2.0.tmp-1-1", "canary-abc1234"} {
		if err := os.MkdirAll(filepath.Join(releases, name), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	v, err := getMostRecentLocallyInstalledVersion(nil)
	if err != nil || v != "4.1.0" {
		t.Fatalf("got %q, %v; want 4.1.0", v, err)
	}
}
