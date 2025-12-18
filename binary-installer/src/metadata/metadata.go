package metadata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type VersionsFile struct {
	BlockedVersions   []string `json:"blockedVersions"`
	SupportedVersions []string `json:"supportedVersions"`
}

type LocalMetadata struct {
	Version           string    `json:"version"`
	UpdateLastChecked time.Time `json:"updateLastChecked"`
}

func GetLocalMetadata() *LocalMetadata {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	metadataPath := fmt.Sprintf("%s/.serverless/binaries/metadata.json", homeDir)
	if _, err := os.Stat(metadataPath); !os.IsNotExist(err) {
		b, err := os.ReadFile(metadataPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "reading metadata %s: %v\n", metadataPath, err)
			return nil
		}

		localMetadata := LocalMetadata{}
		err = json.Unmarshal(b, &localMetadata)
		if err != nil {
			fmt.Fprintf(os.Stderr, "parsing metadata %s: %v\n", metadataPath, err)
			return nil
		}
		return &localMetadata
	}
	return nil
}

func WriteLocalMetadata(version string) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	metadataPath := fmt.Sprintf("%s/.serverless/binaries/metadata.json", homeDir)

	localMetadata := LocalMetadata{
		Version:           version,
		UpdateLastChecked: time.Now(),
	}

	data, err := json.Marshal(localMetadata)
	if err != nil {
		panic(fmt.Errorf("serializing metadata: %w", err))
	}

	err = os.WriteFile(metadataPath, data, 0755)
	if err != nil {
		panic(fmt.Errorf("writing metadata %s: %w", metadataPath, err))
	}
}

func VersionsCachePath() (string, string) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	cacheDir := fmt.Sprintf("%s/.serverless/binaries", homeDir)
	cachePath := filepath.Join(cacheDir, "versions.json")
	return cacheDir, cachePath
}

func ReadVersionsFromCache(cachePath string, maxAge time.Duration, force bool) (*VersionsFile, bool) {
	if force {
		return nil, false
	}
	// Prefer metadata.UpdateLastChecked over file mtime to throttle refresh
	lm := GetLocalMetadata()
	if lm != nil && lm.UpdateLastChecked.Add(maxAge).After(time.Now()) {
		if b, readErr := os.ReadFile(cachePath); readErr == nil {
			var cached VersionsFile
			if json.Unmarshal(b, &cached) == nil {
				return &cached, true
			}
		}
	}
	return nil, false
}

func WriteVersionsCache(cacheDir, cachePath string, body []byte) {
	_ = os.MkdirAll(cacheDir, 0755)
	_ = os.WriteFile(cachePath, body, 0644)
}

// TouchLocalMetadataTimestamp updates updateLastChecked to now while preserving Version.
// If metadata.json does not exist yet, it creates it with an empty Version.
func TouchLocalMetadataTimestamp() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}
	metadataDir := filepath.Join(homeDir, ".serverless", "binaries")
	metadataPath := filepath.Join(metadataDir, "metadata.json")
	_ = os.MkdirAll(metadataDir, 0755)

	current := &LocalMetadata{}
	if b, err := os.ReadFile(metadataPath); err == nil {
		_ = json.Unmarshal(b, current)
	}
	// Preserve current.Version; bump timestamp
	current.UpdateLastChecked = time.Now()
	data, err := json.Marshal(current)
	if err != nil {
		panic(err)
	}
	_ = os.WriteFile(metadataPath, data, 0755)
}
