package main

import (
	"archive/zip"
	"bytes"
	"debug/buildinfo"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// buildBridge compiles the real bridge with the given -buildvcs value.
func buildBridge(t *testing.T, buildvcs string) string {
	t.Helper()
	out := filepath.Join(t.TempDir(), "sls-dev-bridge")
	cmd := exec.Command("go", "build", "-trimpath", "-buildvcs="+buildvcs, "-o", out, "../sls-dev-bridge")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux")
	if msg, err := cmd.CombinedOutput(); err != nil {
		// CI sets SLS_DEV_TEST_REQUIRE_TOOLS=1 (its checkout has .git and git on PATH), so this
		// test cannot pass there by skipping.
		if buildvcs == "true" && os.Getenv("SLS_DEV_TEST_REQUIRE_TOOLS") != "1" {
			t.Skipf("cannot stamp VCS information here (no git checkout?): %s", msg)
		}
		t.Fatalf("%v: %s", err, msg)
	}
	return out
}

func TestAcceptsABridgeWithoutVCSStamps(t *testing.T) {
	if err := checkBridge(buildBridge(t, "false")); err != nil {
		t.Fatal(err)
	}
}

// A VCS stamp changes the bridge's bytes with every commit and with a dirty tree, so the zip's
// sha256 -- the key for published layer versions -- would change with an unchanged bridge.
func TestRejectsABridgeWithVCSStamps(t *testing.T) {
	err := checkBridge(buildBridge(t, "true"))
	if err == nil || !strings.Contains(err.Error(), "-buildvcs=false") {
		t.Fatalf("expected an error naming -buildvcs=false, got %v", err)
	}
}

func TestRejectsABridgeThatIsNotAGoBinary(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bridge")
	if err := os.WriteFile(p, []byte("ELF..."), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := checkBridge(p); err == nil {
		t.Fatal("expected an error for a file without Go build information")
	}
}

func TestOutputIsReplacedOnlyWhenComplete(t *testing.T) {
	out := filepath.Join(t.TempDir(), "layer.zip")
	for _, content := range []string{"first", "second"} {
		if err := writeAtomic(out, []byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := os.ReadFile(out); string(got) != "second" {
		t.Fatalf("got %q", got)
	}
	if _, err := os.Stat(out + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("temporary file left behind: %v", err)
	}
}

func files(t *testing.T, wrapper string) []entry {
	dir := t.TempDir()
	b := filepath.Join(dir, "bridge")
	w := filepath.Join(dir, "wrapper")
	os.WriteFile(b, []byte("ELF..."), 0o644)
	os.WriteFile(w, []byte(wrapper), 0o644)
	return []entry{{"bin/sls-dev-bridge", b}, {"sls-dev-wrapper", w}}
}

func TestSameInputsGiveTheSameBytes(t *testing.T) {
	e := files(t, "#!/bin/bash\nexec \"$@\"\n")
	a, err := buildZip(e)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := buildZip(e)
	if !bytes.Equal(a, b) {
		t.Fatal("two builds differ")
	}
}

func TestEntriesAreExecutableAtTheLayerRoot(t *testing.T) {
	data, err := buildZip(files(t, "#!/bin/bash\n"))
	if err != nil {
		t.Fatal(err)
	}
	r, _ := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	names := []string{}
	for _, f := range r.File {
		names = append(names, f.Name)
		if f.Mode().Perm() != 0o755 {
			t.Errorf("%s mode %v", f.Name, f.Mode())
		}
	}
	if len(names) != 2 || names[0] != "bin/sls-dev-bridge" || names[1] != "sls-dev-wrapper" {
		t.Fatalf("entries %v", names)
	}
}

// buildGo compiles pkg for linux/goarch the way the layer build does.
func buildGo(t *testing.T, pkg, goarch string) string {
	t.Helper()
	out := filepath.Join(t.TempDir(), "bin")
	cmd := exec.Command("go", "build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w -buildid=", "-o", out, pkg)
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux", "GOARCH="+goarch)
	if msg, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, msg)
	}
	return out
}

// zipEntries lists a zip's entry names (in archive order) and modes.
func zipEntries(t *testing.T, data []byte) ([]string, map[string]os.FileMode) {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	modes := map[string]os.FileMode{}
	for _, f := range r.File {
		names = append(names, f.Name)
		modes[f.Name] = f.Mode().Perm()
	}
	return names, modes
}

const sortedEntries = "bin/sls-dev-bridge,sls-dev-THIRD_PARTY_NOTICES,sls-dev-wrapper"

// Lambda merges every layer into /opt, so the notices carry the sls-dev- prefix; the zip stays
// sorted by name whatever order the entries are given in, and the notices are readable, not
// executable.
func TestEntriesAreSortedAndTheNoticesReadable(t *testing.T) {
	e := files(t, "#!/bin/bash\n")
	n := filepath.Join(t.TempDir(), "NOTICES")
	os.WriteFile(n, []byte("== x v1 ==\n"), 0o644)
	data, err := buildZip([]entry{{noticesName, n}, e[1], e[0]})
	if err != nil {
		t.Fatal(err)
	}
	names, modes := zipEntries(t, data)
	if strings.Join(names, ",") != sortedEntries {
		t.Fatalf("entries %v", names)
	}
	if modes["sls-dev-THIRD_PARTY_NOTICES"] != 0o644 || modes["bin/sls-dev-bridge"] != 0o755 || modes["sls-dev-wrapper"] != 0o755 {
		t.Fatalf("modes %v", modes)
	}
	again, _ := buildZip([]entry{e[0], e[1], {noticesName, n}})
	if !bytes.Equal(data, again) {
		t.Fatal("the zip depends on the order the entries are given in")
	}
}

// A bridge linking a module whose licence the notices do not carry is refused, and no zip is
// written: the layer ships the licences of everything in the binary, Go's own included.
func TestRefusesABridgeLinkingAModuleTheNoticesOmit(t *testing.T) {
	bin := buildGo(t, "../../testdata/linked", "arm64")
	info, err := buildinfo.ReadFile(bin)
	if err != nil || len(info.Deps) != 1 {
		t.Fatalf("%v %v", info, err)
	}
	dep := info.Deps[0]
	linked := "== " + dep.Path + " " + dep.Version + " ==\n"
	dir := t.TempDir()
	wrapper := filepath.Join(dir, "wrapper")
	os.WriteFile(wrapper, []byte("#!/bin/bash\n"), 0o755)
	notices := filepath.Join(dir, "NOTICES")
	out := filepath.Join(dir, "layer.zip")
	for body, missing := range map[string]string{
		goSection: dep.Path + " " + dep.Version,
		goSection + "== " + dep.Path + " v0.0.1 ==\n": dep.Path + " " + dep.Version,
		linked: "Go standard library",
		"x" + goSection + "== " + dep.Path + " " + dep.Version: dep.Path + " " + dep.Version,
	} {
		os.WriteFile(notices, []byte(body), 0o644)
		err := run(bin, wrapper, notices, out)
		if err == nil || !strings.Contains(err.Error(), missing) || !strings.Contains(err.Error(), "a bug in cmd/notices") {
			t.Errorf("notices %q: %v, want an error naming %s", body, err, missing)
		}
		if _, statErr := os.Stat(out); !os.IsNotExist(statErr) {
			t.Fatalf("notices %q: a zip was written", body)
		}
	}
	os.WriteFile(notices, []byte(goSection+linked+"-- LICENSE --\n"), 0o644)
	if err := run(bin, wrapper, notices, out); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if names, _ := zipEntries(t, data); strings.Join(names, ",") != sortedEntries {
		t.Fatalf("entries %v", names)
	}
}

func TestRejectsAWrapperWithCarriageReturns(t *testing.T) {
	if _, err := buildZip(files(t, "#!/bin/bash\r\nexec \"$@\"\r\n")); err == nil {
		t.Fatal("expected an error for CRLF line endings")
	}
}

// The notices cmd/notices generates during the layer build cover the bridge as the build compiles
// it, on both architectures; a notices file missing a linked module is refused with an error
// naming it and blaming the generator.
func TestNoticesMustListEveryLinkedModule(t *testing.T) {
	full := filepath.Join(t.TempDir(), "NOTICES")
	cmd := exec.Command("go", "run", "./cmd/notices", "-out", full)
	cmd.Dir = filepath.Join("..", "..")
	if msg, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, msg)
	}
	bridges := map[string]string{}
	for _, goarch := range []string{"arm64", "amd64"} {
		bridges[goarch] = buildGo(t, "../sls-dev-bridge", goarch)
		if err := checkNotices(bridges[goarch], full); err != nil {
			t.Errorf("%s: the generated notices do not cover the bridge: %v", goarch, err)
		}
	}
	short := filepath.Join(t.TempDir(), "SHORT")
	os.WriteFile(short, []byte("== github.com/coder/websocket v1.8.15 ==\n"), 0o644)
	err := checkNotices(bridges["arm64"], short)
	for _, want := range []string{"github.com/eclipse/paho.golang", "github.com/aws/aws-sdk-go-v2/service/iotdataplane", "a bug in cmd/notices"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("expected an error naming %s, got %v", want, err)
		}
	}
}
