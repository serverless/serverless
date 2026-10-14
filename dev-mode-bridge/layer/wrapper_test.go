//go:build !windows

package layer

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

var (
	buildOnce   sync.Once
	binDir      string
	bridgeBin   string
	buildFailed error
)

// TestMain owns the directory the bridge is built into: the build is shared by every test, so no
// single test's t.Cleanup may remove it.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "sls-dev-bridge-test-")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	binDir = dir
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

// skipUnlessRequired skips a test whose tool (bash >= 4, curl) is missing, or fails it when
// SLS_DEV_TEST_REQUIRE_TOOLS=1. CI sets it so the wrapper tests cannot pass by skipping.
func skipUnlessRequired(t *testing.T, format string, args ...any) {
	t.Helper()
	if os.Getenv("SLS_DEV_TEST_REQUIRE_TOOLS") == "1" {
		t.Fatalf(format+" (required: SLS_DEV_TEST_REQUIRE_TOOLS=1)", args...)
	}
	t.Skipf(format, args...)
}

// bash returns a bash >= 4 (Lambda runs 4.2 on AL2 and 5.2 on AL2023) or skips.
func bash(t *testing.T) string {
	t.Helper()
	b := os.Getenv("SLS_DEV_TEST_BASH")
	if b == "" {
		b = "bash"
	}
	out, err := exec.Command(b, "-c", "echo ${BASH_VERSINFO[0]}").Output()
	if err != nil {
		skipUnlessRequired(t, "bash not available: %v", err)
	}
	if v, _ := strconv.Atoi(strings.TrimSpace(string(out))); v < 4 {
		skipUnlessRequired(t, "the wrapper needs bash >= 4; set SLS_DEV_TEST_BASH (macOS: brew install bash)")
	}
	return b
}

type sandbox struct {
	t       *testing.T
	bash    string
	dir     string
	wrapper string
	out     string
	realAPI string
	port    int
}

func freePort(t *testing.T) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

// newSandbox lays out <dir>/sls-dev-wrapper and, with a bridge, <dir>/bin/sls-dev-bridge -- the
// shape the layer has under /opt -- plus a fake Runtime API.
func newSandbox(t *testing.T, withBridge bool) *sandbox {
	b := bash(t)
	dir := t.TempDir()
	src, err := os.ReadFile("sls-dev-wrapper")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sls-dev-wrapper"), src, 0o755); err != nil {
		t.Fatal(err)
	}
	if withBridge {
		buildOnce.Do(func() {
			bridgeBin = filepath.Join(binDir, "sls-dev-bridge")
			out, err := exec.Command("go", "build", "-o", bridgeBin, "../cmd/sls-dev-bridge").CombinedOutput()
			if err != nil {
				buildFailed = fmt.Errorf("%v: %s", err, out)
			}
		})
		if buildFailed != nil {
			t.Fatal(buildFailed)
		}
		data, err := os.ReadFile(bridgeBin)
		if err != nil {
			t.Fatal(err)
		}
		putBridge(t, dir, data)
	}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-1")
	}))
	t.Cleanup(api.Close)
	return &sandbox{t: t, bash: b, dir: dir, wrapper: filepath.Join(dir, "sls-dev-wrapper"),
		out: filepath.Join(dir, "runtime.out"), realAPI: strings.TrimPrefix(api.URL, "http://"), port: freePort(t)}
}

// putBridge installs data as <dir>/bin/sls-dev-bridge, where the wrapper looks for the bridge.
func putBridge(t *testing.T, dir string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "bin", "sls-dev-bridge"), data, 0o755); err != nil {
		t.Fatal(err)
	}
}

func (s *sandbox) script(name, body string) string {
	p := filepath.Join(s.dir, name)
	if err := os.WriteFile(p, []byte("#!/bin/bash\n"+body), 0o755); err != nil {
		s.t.Fatal(err)
	}
	return p
}

// fakeRuntime records what the runtime sees and, with FETCH=1, calls /next through whatever
// AWS_LAMBDA_RUNTIME_API points at.
func (s *sandbox) fakeRuntime() string {
	return s.script("runtime", `{
  echo "api=$AWS_LAMBDA_RUNTIME_API"
  echo "real=$SLS_DEV_REAL_RUNTIME_API"
  echo "chained=${SLS_TEST_CHAINED:-no}"
  printf 'arg=%s\n' "$@"
  if [ -n "$FETCH" ]; then
    echo "next=$(curl -s -o /dev/null -w '%{http_code}' "http://$AWS_LAMBDA_RUNTIME_API/2018-06-01/runtime/invocation/next")"
  fi
} > "$OUT"
`)
}

// run executes the wrapper the way Lambda does and returns the runtime's record and stderr.
func (s *sandbox) run(extraEnv ...string) (string, string) {
	runtime := s.fakeRuntime()
	cmd := exec.Command(s.bash, s.wrapper, runtime, "first arg", "--flag")
	env := []string{
		"PATH=" + os.Getenv("PATH"),
		"AWS_LAMBDA_RUNTIME_API=" + s.realAPI,
		"OUT=" + s.out,
		"SLS_DEV_BRIDGE_PORT=" + strconv.Itoa(s.port),
	}
	// "NAME=value" sets or overrides a variable; a bare "NAME" removes it.
	for _, e := range extraEnv {
		if strings.Contains(e, "=") {
			env = append(env, e)
			continue
		}
		kept := env[:0]
		for _, have := range env {
			if !strings.HasPrefix(have, e+"=") {
				kept = append(kept, have)
			}
		}
		env = kept
	}
	cmd.Env = env
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	// A file, not a pipe: the bridge inherits stderr and outlives the fake runtime, so with a pipe
	// Wait would block until the bridge exits.
	errPath := filepath.Join(s.dir, "wrapper.err")
	stderr, err := os.Create(errPath)
	if err != nil {
		s.t.Fatal(err)
	}
	defer stderr.Close()
	cmd.Stderr = stderr
	// A record left by an earlier run must not pass for this one.
	os.Remove(s.out)
	if err := cmd.Start(); err != nil {
		s.t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		s.t.Fatal("the wrapper did not finish within 10 s (exec loop?)")
	}
	// The bridge outlives the fake runtime: kill the whole process group.
	syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	out, _ := os.ReadFile(s.out)
	errOut, _ := os.ReadFile(errPath)
	return string(out), string(errOut)
}

func TestPointsTheRuntimeAtTheBridge(t *testing.T) {
	if _, err := exec.LookPath("curl"); err != nil {
		skipUnlessRequired(t, "curl not available")
	}
	s := newSandbox(t, true)
	out, stderr := s.run("FETCH=1")
	for _, want := range []string{
		fmt.Sprintf("api=127.0.0.1:%d", s.port),
		"real=" + s.realAPI,
		"chained=no",
		"arg=first arg\narg=--flag",
		"next=200",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in\n%s\nstderr:\n%s", want, out, stderr)
		}
	}
}

func TestChainsTheOriginalWrapper(t *testing.T) {
	s := newSandbox(t, true)
	orig := s.script("orig-wrapper", "export SLS_TEST_CHAINED=yes\nexec \"$@\"\n")
	out, _ := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=" + orig)
	if !strings.Contains(out, "chained=yes") || !strings.Contains(out, fmt.Sprintf("api=127.0.0.1:%d", s.port)) {
		t.Fatalf("got\n%s", out)
	}
}

func TestMissingOriginalWrapperStartsTheRuntimeDirectly(t *testing.T) {
	s := newSandbox(t, true)
	out, stderr := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=/opt/sls-sdk-node/exec-wrapper.sh")
	if !strings.Contains(out, "chained=no") || !strings.Contains(stderr, "missing or not executable") {
		t.Fatalf("out\n%s\nstderr\n%s", out, stderr)
	}
}

func TestIgnoresSelfReference(t *testing.T) {
	s := newSandbox(t, true)
	for _, self := range []string{"/opt/sls-dev-wrapper", s.wrapper} {
		out, _ := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=" + self)
		if !strings.Contains(out, fmt.Sprintf("api=127.0.0.1:%d", s.port)) {
			t.Fatalf("self reference %s: got\n%s", self, out)
		}
	}
}

func TestBridgeFailureKeepsTheChainAndTheRealAPI(t *testing.T) {
	s := newSandbox(t, true)
	busy, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", s.port))
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	orig := s.script("orig-wrapper", "export SLS_TEST_CHAINED=yes\nexec \"$@\"\n")
	out, stderr := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=" + orig)
	if !strings.Contains(out, "api="+s.realAPI) || !strings.Contains(out, "chained=yes") {
		t.Fatalf("out\n%s\nstderr\n%s", out, stderr)
	}
}

func TestMissingBridgeBinaryRunsTheDeployedCode(t *testing.T) {
	s := newSandbox(t, false)
	out, stderr := s.run()
	if !strings.Contains(out, "api="+s.realAPI) || !strings.Contains(stderr, "bridge unavailable") {
		t.Fatalf("out\n%s\nstderr\n%s", out, stderr)
	}
}

func TestOriginalWrapperThatIsADirectoryIsSkipped(t *testing.T) {
	s := newSandbox(t, true)
	out, stderr := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=" + t.TempDir())
	if !strings.Contains(out, "chained=no") || !strings.Contains(out, fmt.Sprintf("api=127.0.0.1:%d", s.port)) ||
		!strings.Contains(stderr, "missing or not executable") {
		t.Fatalf("out\n%s\nstderr\n%s", out, stderr)
	}
}

func TestBridgeThatNeverSignalsReadyKeepsTheChainAndTheRealAPI(t *testing.T) {
	s := newSandbox(t, false)
	// A bridge that starts but never prints "ready" (and never exits on its own).
	putBridge(t, s.dir, []byte("#!/bin/bash\nsleep 30\n"))
	orig := s.script("orig-wrapper", "export SLS_TEST_CHAINED=yes\nexec \"$@\"\n")
	start := time.Now()
	out, stderr := s.run("SLS_DEV_ORIGINAL_EXEC_WRAPPER=" + orig)
	if !strings.Contains(out, "api="+s.realAPI) || !strings.Contains(out, "chained=yes") ||
		!strings.Contains(out, "arg=first arg\narg=--flag") || !strings.Contains(stderr, "bridge did not start") {
		t.Fatalf("out\n%s\nstderr\n%s", out, stderr)
	}
	if waited := time.Since(start); waited < 2*time.Second {
		t.Errorf("the wrapper gave up after %v; it should wait for ready for 2 s", waited)
	}
}

func TestMissingRuntimeAPIRunsTheDeployedCode(t *testing.T) {
	for name, env := range map[string]string{"unset": "AWS_LAMBDA_RUNTIME_API", "empty": "AWS_LAMBDA_RUNTIME_API="} {
		t.Run(name, func(t *testing.T) {
			s := newSandbox(t, true)
			orig := s.script("orig-wrapper", "export SLS_TEST_CHAINED=yes\nexec \"$@\"\n")
			out, stderr := s.run(env, "SLS_DEV_ORIGINAL_EXEC_WRAPPER="+orig)
			// The chain and the runtime still run, untouched: no bridge, no re-pointed API.
			for _, want := range []string{"api=\n", "real=\n", "chained=yes", "arg=first arg\narg=--flag"} {
				if !strings.Contains(out, want) {
					t.Errorf("missing %q in\n%s\nstderr:\n%s", want, out, stderr)
				}
			}
			if !strings.Contains(stderr, "bridge unavailable") {
				t.Errorf("stderr\n%s", stderr)
			}
		})
	}
}

func TestWrapperAvoidsWhatLambdaBashCannotRun(t *testing.T) {
	src, err := os.ReadFile("sls-dev-wrapper")
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{
		"<(", ">(", // process substitution: no /dev/fd in Lambda
		"EPOCHREALTIME", "@Q}", "wait -n", "declare -n", "BASHPID", "[-", "|&", "mapfile -d", // newer than bash 4.2 (AL2)
		"\r", // LF only
	} {
		if strings.Contains(string(src), bad) {
			t.Errorf("wrapper contains %q (no /dev/fd in Lambda; bash 4.2 on AL2; LF only)", bad)
		}
	}
	// Keep read -t to whole seconds, the form every bash the wrapper meets accepts.
	if regexp.MustCompile(`read [^\n]*-t +[0-9]*\.`).Match(src) {
		t.Error("wrapper uses a fractional read -t timeout; keep it to whole seconds")
	}
}
