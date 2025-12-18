package version

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetFrameworkVersionFromFile_Various(t *testing.T) {
	tmp := t.TempDir()

	// YAML
	y := filepath.Join(tmp, "s.yml")
	_ = os.WriteFile(y, []byte("frameworkVersion: 1.2.3\n"), 0o644)
	v, err := getFrameworkVersionFromFile(y)
	if err != nil || v != "1.2.3" {
		t.Fatalf("yaml: %s %v", v, err)
	}

	// JSON
	j := filepath.Join(tmp, "s.json")
	_ = os.WriteFile(j, []byte(`{"frameworkVersion":"2.3.4"}`), 0o644)
	v, err = getFrameworkVersionFromFile(j)
	if err != nil || v != "2.3.4" {
		t.Fatalf("json: %s %v", v, err)
	}

	// JS (generic regex)
	js := filepath.Join(tmp, "s.js")
	_ = os.WriteFile(js, []byte("const x = { frameworkVersion: '3.4.5' }"), 0o644)
	v, err = getFrameworkVersionFromFile(js)
	if err != nil || v != "3.4.5" {
		t.Fatalf("js: %s %v", v, err)
	}

	// Missing frameworkVersion should return empty with ERROR_NO_FRAMEWORK_VERSION
	y2 := filepath.Join(tmp, "s2.yml")
	_ = os.WriteFile(y2, []byte("service: demo\n"), 0o644)
	v, err = getFrameworkVersionFromFile(y2)
	if err == nil || v != "" {
		t.Fatalf("expected error when frameworkVersion missing, got v=%q err=%v", v, err)
	}
}

func TestGetVersionGeneric_UnparseableButPresent(t *testing.T) {
	// Contains 'frameworkVersion' but not a parsable value; should return ERROR_NO_FRAMEWORK_VERSION after printing notice
	v, err := getVersionGeneric([]byte("frameworkVersion:   \n"))
	if err == nil || v != "" {
		t.Fatalf("expected error and empty version, got v=%q err=%v", v, err)
	}
	if err.Error() != ERROR_NO_FRAMEWORK_VERSION {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGetVersionGeneric_NotPresent(t *testing.T) {
	v, err := getVersionGeneric([]byte("const x = 123;"))
	if err == nil || v != "" {
		t.Fatalf("expected error and empty version, got v=%q err=%v", v, err)
	}
	if err.Error() != ERROR_NO_FRAMEWORK_VERSION {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGetFrameworkVersionFromFile_TS_MJS_Unsupported(t *testing.T) {
	tmp := t.TempDir()

	// .ts should go through generic and parse
	tsFile := filepath.Join(tmp, "s.ts")
	_ = os.WriteFile(tsFile, []byte("export const cfg = { frameworkVersion: '5.6.7' };"), 0o644)
	v, err := getFrameworkVersionFromFile(tsFile)
	if err != nil || v != "5.6.7" {
		t.Fatalf("ts: %s %v", v, err)
	}

	// .mjs is an unsupported extension in this function; expect empty with nil error
	mjsFile := filepath.Join(tmp, "s.mjs")
	_ = os.WriteFile(mjsFile, []byte("export const cfg = { frameworkVersion: '7.8.9' };"), 0o644)
	v, err = getFrameworkVersionFromFile(mjsFile)
	if err != nil || v != "" {
		t.Fatalf("mjs expected empty+nil, got v=%q err=%v", v, err)
	}

	// Unsupported extension e.g., .txt should also return empty+nil
	txt := filepath.Join(tmp, "x.txt")
	_ = os.WriteFile(txt, []byte("noop"), 0o644)
	v, err = getFrameworkVersionFromFile(txt)
	if err != nil || v != "" {
		t.Fatalf("txt expected empty+nil, got v=%q err=%v", v, err)
	}
}

func TestGetVersionFromJSON_Malformed(t *testing.T) {
	v, err := getVersionFromJSON([]byte("{ bad json"))
	if err == nil || v != "" {
		t.Fatalf("expected error and empty version, got v=%q err=%v", v, err)
	}
}

func TestGetVersionFromJSON_MissingKey(t *testing.T) {
	v, err := getVersionFromJSON([]byte(`{}`))
	if err == nil || v != "" {
		t.Fatalf("expected ERROR_NO_FRAMEWORK_VERSION, got v=%q err=%v", v, err)
	}
	if err.Error() != ERROR_NO_FRAMEWORK_VERSION {
		t.Fatalf("unexpected error: %v", err)
	}
}
