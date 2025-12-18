package version

import (
	"fmt"
	"os"
)

func getMostRecentLocallyInstalledVersion(constraint *string) (FrameworkVersion, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	releasesFolderPath := fmt.Sprintf("%s/.serverless/releases", homeDir)
	files, err := os.ReadDir(releasesFolderPath)
	if err != nil {
		return "", err
	}

	versions := []string{}
	for _, file := range files {
		if file.IsDir() {
			versions = append(versions, file.Name())
		}
	}
	if len(versions) == 0 {
		return "", fmt.Errorf("no versions installed")
	}
	var updatedConstraint = "*"
	if constraint != nil && *constraint != "" {
		updatedConstraint = *constraint
	}
	closestMatch, err := findClosestMatch(versions, updatedConstraint)
	if err != nil {
		return "", err
	}
	return FrameworkVersion(closestMatch), nil
}

func localReleaseFallback(version *string) (*FrameworkRelease, error) {
	frameworkVersion, err := getMostRecentLocallyInstalledVersion(version)
	if err != nil {
		return nil, err
	}

	if frameworkVersion == "" {
		return nil, fmt.Errorf("no versions installed")
	}

	return &FrameworkRelease{
		Version:       frameworkVersion,
		ReleasePath:   frameworkVersion.releasePath(),
		LatestVersion: nil,
	}, nil
}
