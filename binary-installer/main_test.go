package main

import (
	"os"
	"path/filepath"
	"testing"
)

func normalizePath(path string) string {
	cleaned := filepath.Clean(path)
	if resolved, err := filepath.EvalSymlinks(cleaned); err == nil {
		return resolved
	}
	return cleaned
}

func TestGetConfigPathFromArgs(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name     string
		args     []string
		expected string
		found    bool
	}{
		{
			name:     "long flag with separate value",
			args:     []string{"deploy", "--config", "custom.yml"},
			expected: "custom.yml",
			found:    true,
		},
		{
			name:     "long flag with equals",
			args:     []string{"deploy", "--config=custom.yml"},
			expected: "custom.yml",
			found:    true,
		},
		{
			name:     "short flag with separate value",
			args:     []string{"deploy", "-c", "custom.yml"},
			expected: "custom.yml",
			found:    true,
		},
		{
			name:     "short flag with equals",
			args:     []string{"deploy", "-c=custom.yml"},
			expected: "custom.yml",
			found:    true,
		},
		{
			name:     "flag without value",
			args:     []string{"deploy", "--config"},
			expected: "",
			found:    false,
		},
		{
			name:     "no flag present",
			args:     []string{"deploy"},
			expected: "",
			found:    false,
		},
		{
			name:     "ignore args after delimiter",
			args:     []string{"invoke", "local", "--function", "foo", "--", "--config", "custom.yml"},
			expected: "",
			found:    false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, ok := getConfigPathFromArgs(tc.args)
			if ok != tc.found {
				t.Fatalf("expected found=%t, got %t", tc.found, ok)
			}
			if got != tc.expected {
				t.Fatalf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}

func TestResolveConfigFilePathWithFlag(t *testing.T) {
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(origDir); chdirErr != nil {
			t.Errorf("failed to restore working directory: %v", chdirErr)
		}
	})

	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed to change dir to temp: %v", err)
	}

	configFile := "custom-config.yml"
	if err := os.WriteFile(configFile, []byte("service: demo\n"), 0o644); err != nil {
		t.Fatalf("failed to create config file: %v", err)
	}

	got := resolveConfigFilePath([]string{"deploy", "--config", configFile})
	want := filepath.Join(tmpDir, configFile)
	if normalizePath(got) != normalizePath(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestShouldCheckForUpdates(t *testing.T) {
	// default
	os.Args = []string{"serverless"}
	os.Unsetenv("SERVERLESS_FRAMEWORK_FORCE_UPDATE")
	if shouldCheckForUpdates() {
		t.Fatalf("expected false by default")
	}
	// update command
	os.Args = []string{"serverless", "update"}
	if !shouldCheckForUpdates() {
		t.Fatalf("expected true for update")
	}
	// FORCE env
	os.Args = []string{"serverless"}
	os.Setenv("SERVERLESS_FRAMEWORK_FORCE_UPDATE", "1")
	defer os.Unsetenv("SERVERLESS_FRAMEWORK_FORCE_UPDATE")
	if !shouldCheckForUpdates() {
		t.Fatalf("expected true when FORCE env set")
	}
}

func TestResolveConfigFilePath_Edges(t *testing.T) {
	origDir, _ := os.Getwd()
	t.Cleanup(func() { _ = os.Chdir(origDir) })
	tmp := t.TempDir()
	_ = os.Chdir(tmp)

	// tilde path expands
	home := t.TempDir()
	t.Setenv("HOME", home)
	cfg := filepath.Join(home, "serverless.yml")
	_ = os.WriteFile(cfg, []byte("service: demo\n"), 0o644)
	got := resolveConfigFilePath([]string{"--config", "~/serverless.yml"})
	if filepath.Clean(got) != filepath.Clean(cfg) {
		t.Fatalf("tilde expansion failed: %s != %s", got, cfg)
	}

	// directory path falls back to local discovery
	svcFile := filepath.Join(tmp, "serverless.yml")
	_ = os.WriteFile(svcFile, []byte("service: demo\n"), 0o644)
	d := filepath.Join(tmp, "configs")
	_ = os.MkdirAll(d, 0o755)
	got = resolveConfigFilePath([]string{"--config", d})
	// On macOS TMPDIR may contain /private prefix; compare after EvalSymlinks
	gotResolved, _ := filepath.EvalSymlinks(got)
	wantResolved, _ := filepath.EvalSymlinks(svcFile)
	if filepath.Clean(gotResolved) != filepath.Clean(wantResolved) {
		t.Fatalf("dir fallback failed: %s != %s", gotResolved, wantResolved)
	}

	// unknown file falls back to local discovery
	got = resolveConfigFilePath([]string{"--config", "does-not-exist.yml"})
	gotResolved, _ = filepath.EvalSymlinks(got)
	wantResolved, _ = filepath.EvalSymlinks(svcFile)
	if filepath.Clean(gotResolved) != filepath.Clean(wantResolved) {
		t.Fatalf("unknown file fallback failed: %s != %s", gotResolved, wantResolved)
	}
}

func TestResolveConfigFilePathFallback(t *testing.T) {
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(origDir); chdirErr != nil {
			t.Errorf("failed to restore working directory: %v", chdirErr)
		}
	})

	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed to change dir to temp: %v", err)
	}

	if err := os.WriteFile("serverless.yml", []byte("service: demo\n"), 0o644); err != nil {
		t.Fatalf("failed to create default config: %v", err)
	}

	got := resolveConfigFilePath(nil)
	want := filepath.Join(tmpDir, "serverless.yml")
	if normalizePath(got) != normalizePath(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveConfigFilePathMissingFile(t *testing.T) {
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(origDir); chdirErr != nil {
			t.Errorf("failed to restore working directory: %v", chdirErr)
		}
	})

	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed to change dir to temp: %v", err)
	}

	if err := os.WriteFile("serverless.yml", []byte("service: demo\n"), 0o644); err != nil {
		t.Fatalf("failed to create default config: %v", err)
	}

	got := resolveConfigFilePath([]string{"deploy", "--config", "does-not-exist.yml"})
	want := filepath.Join(tmpDir, "serverless.yml")
	if normalizePath(got) != normalizePath(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestResolveConfigFilePathDirectory(t *testing.T) {
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(origDir); chdirErr != nil {
			t.Errorf("failed to restore working directory: %v", chdirErr)
		}
	})

	tmpDir := t.TempDir()
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("failed to change dir to temp: %v", err)
	}

	if err := os.WriteFile("serverless.yml", []byte("service: demo\n"), 0o644); err != nil {
		t.Fatalf("failed to create default config: %v", err)
	}

	dirName := "configs"
	if err := os.Mkdir(dirName, 0o755); err != nil {
		t.Fatalf("failed to create directory: %v", err)
	}

	got := resolveConfigFilePath([]string{"deploy", "--config", dirName})
	want := filepath.Join(tmpDir, "serverless.yml")
	if normalizePath(got) != normalizePath(want) {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
