package metadata

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReadVersionsFromCache_FreshStaleForce(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir, cachePath := VersionsCachePath()
	_ = os.MkdirAll(cacheDir, 0o755)
	_ = os.WriteFile(cachePath, []byte(`{"blockedVersions":[],"supportedVersions":["4.0.0"]}`), 0o644)

	// Fresh metadata -> expect cached
	WriteLocalMetadata("4.0.0")
	if vf, ok := ReadVersionsFromCache(cachePath, 24*time.Hour, false); !ok || vf == nil {
		t.Fatalf("expected cached versions when fresh metadata")
	}

	// Stale metadata -> expect miss
	stale := time.Now().Add(-25 * time.Hour).Format(time.RFC3339Nano)
	metaPath := filepath.Join(tempHome, ".serverless", "binaries", "metadata.json")
	_ = os.WriteFile(metaPath, []byte(`{"version":"4.0.0","updateLastChecked":"`+stale+`"}`), 0o644)
	if vf, ok := ReadVersionsFromCache(cachePath, 24*time.Hour, false); ok || vf != nil {
		t.Fatalf("expected cache miss when metadata stale")
	}

	// Force=true -> expect miss even if fresh
	WriteLocalMetadata("4.0.0")
	if vf, ok := ReadVersionsFromCache(cachePath, 24*time.Hour, true); ok || vf != nil {
		t.Fatalf("expected cache miss when force=true")
	}
}

func TestLocalMetadata_RoundTrip_AndInvalid(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	// Ensure metadata dir exists
	_ = os.MkdirAll(filepath.Join(tempHome, ".serverless", "binaries"), 0o755)
	WriteLocalMetadata("4.2.0")
	if lm := GetLocalMetadata(); lm == nil || lm.Version != "4.2.0" {
		t.Fatalf("expected version 4.2.0, got %#v", lm)
	}
	// Assert updateLastChecked increases and version updates on subsequent writes
	first := GetLocalMetadata()
	if first == nil {
		t.Fatalf("metadata not written")
	}
	t0 := first.UpdateLastChecked
	time.Sleep(10 * time.Millisecond)
	WriteLocalMetadata("4.3.0")
	second := GetLocalMetadata()
	if second == nil {
		t.Fatalf("metadata not readable after rewrite")
	}
	if !second.UpdateLastChecked.After(t0) {
		t.Fatalf("updateLastChecked did not increase: %v -> %v", t0, second.UpdateLastChecked)
	}
	if second.Version != "4.3.0" {
		t.Fatalf("expected version 4.3.0 after rewrite, got %#v", second)
	}
	// Write invalid JSON and ensure GetLocalMetadata returns nil, not panic
	metaPath := filepath.Join(tempHome, ".serverless", "binaries", "metadata.json")
	_ = os.WriteFile(metaPath, []byte("{"), 0o644)
	if lm := GetLocalMetadata(); lm != nil {
		t.Fatalf("expected nil metadata on invalid JSON")
	}
}
