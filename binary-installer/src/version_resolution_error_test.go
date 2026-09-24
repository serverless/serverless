package version

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sf-core/src/metadata"
)

// A valid pin that no supported release satisfies comes back as
// noMatchingVersionError, carrying the index the message is built from.
func TestGetVersion_NoMatchingRelease(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	cacheDir := filepath.Join(tempHome, ".serverless", "binaries")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	body := []byte(`{"blockedVersions":[],"supportedVersions":["4.0.4","4.42.0"]}`)
	if err := os.WriteFile(filepath.Join(cacheDir, "versions.json"), body, 0o644); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	metadata.WriteLocalMetadata("4.42.0")

	_, err := getVersion("3", false)
	var noMatch *noMatchingVersionError
	if !errors.As(err, &noMatch) {
		t.Fatalf("want noMatchingVersionError, got %v", err)
	}
	if noMatch.constraint != "3" || len(noMatch.supported) != 2 {
		t.Fatalf("unexpected error contents: %+v", noMatch)
	}
}

// The message names only versions taken from the pin and the index.
func TestDescribeVersionResolutionError(t *testing.T) {
	supported := []string{"4.42.0", "4.0.4", "4.10.1"}
	noMatch := func(c string) error {
		return &noMatchingVersionError{constraint: c, supported: supported}
	}
	tests := []struct {
		name, constraint string
		err              error
		want             string
	}{
		{
			name:       "pin older than every release",
			constraint: "3",
			err:        noMatch("3"),
			want: "frameworkVersion \"3\" in serverless.yml is older than any release this CLI can install (4.0.4 to 4.42.0).\n" +
				"To keep using it, add it to the project with \"npm install --save-dev serverless@3\"; this CLI then runs the project's copy.\n" +
				"To use the newest release, change frameworkVersion to a range that includes 4.42.0 (for example \"4\"). Then run \"serverless agent skills read serverless-upgrade\" here: that Agent Skill walks through the rest of the upgrade.",
		},
		{
			name:       "range pin older than every release",
			constraint: "^3.38.0",
			err:        noMatch("^3.38.0"),
			want: "frameworkVersion \"^3.38.0\" in serverless.yml is older than any release this CLI can install (4.0.4 to 4.42.0).\n" +
				"To keep using it, add it to the project with \"npm install --save-dev serverless@^3.38.0\"; this CLI then runs the project's copy.\n" +
				"To use the newest release, change frameworkVersion to a range that includes 4.42.0 (for example \"4\"). Then run \"serverless agent skills read serverless-upgrade\" here: that Agent Skill walks through the rest of the upgrade.",
		},
		{
			// Copied into a shell, an unquoted < or > would redirect.
			name:       "range with shell operators is quoted in the npm command",
			constraint: ">=2 <4",
			err:        noMatch(">=2 <4"),
			want: "frameworkVersion \">=2 <4\" in serverless.yml is older than any release this CLI can install (4.0.4 to 4.42.0).\n" +
				"To keep using it, add it to the project with \"npm install --save-dev 'serverless@>=2 <4'\"; this CLI then runs the project's copy.\n" +
				"To use the newest release, change frameworkVersion to a range that includes 4.42.0 (for example \"4\"). Then run \"serverless agent skills read serverless-upgrade\" here: that Agent Skill walks through the rest of the upgrade.",
		},
		{
			name:       "pin newer than every release",
			constraint: "4.99.0",
			err:        noMatch("4.99.0"),
			want:       "No release matches frameworkVersion \"4.99.0\" in serverless.yml (releases available: 4.0.4 to 4.42.0). To use the newest release, change frameworkVersion to a range that includes 4.42.0 (for example \"4\").",
		},
		{
			name:       "any other failure keeps its own error",
			constraint: "4",
			err:        errors.New("fetching https://install.serverless.com/versions.json: connection refused"),
			want:       "Could not resolve frameworkVersion \"4\" in serverless.yml: fetching https://install.serverless.com/versions.json: connection refused",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := describeVersionResolutionError(tc.constraint, "/work/svc/serverless.yml", tc.err)
			if got != tc.want {
				t.Fatalf("\nwant: %s\n got: %s", tc.want, got)
			}
		})
	}
}
