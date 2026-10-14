package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/bridge"
)

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func TestRunPrintsReadyThenProxies(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-9")
	}))
	defer api.Close()
	port := freePort(t)
	env := map[string]string{
		"SLS_DEV_REAL_RUNTIME_API": strings.TrimPrefix(api.URL, "http://"),
		"SLS_DEV_BRIDGE_PORT":      strconv.Itoa(port),
	}
	pr, pw := io.Pipe()
	// A run that fails before "ready" closes the pipe with its error instead of hanging the test.
	go func() { pw.CloseWithError(run(func(k string) string { return env[k] }, pw, func(string, ...any) {})) }()
	line, err := bufio.NewReader(pr).ReadString('\n')
	if err != nil || line != "ready\n" {
		t.Fatalf("ready line %q %v", line, err)
	}
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/2018-06-01/runtime/invocation/next", port))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-9" {
		t.Fatalf("not proxied: %v", resp.Header)
	}
}

type nopCloser struct{ io.Writer }

func (nopCloser) Close() error { return nil }

func TestRunFailsWithoutARuntimeAPI(t *testing.T) {
	if err := run(func(string) string { return "" }, nopCloser{io.Discard}, func(string, ...any) {}); err == nil {
		t.Fatal("expected an error")
	}
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestReverseProxyErrorLinesCarryThePrefix(t *testing.T) {
	// Registered first so it runs last, after the servers below are closed.
	t.Cleanup(func() {
		log.SetOutput(os.Stderr)
		log.SetPrefix("")
		log.SetFlags(log.LstdFlags)
	})
	out := &syncBuffer{}
	logger := newLogger(out)

	// The Runtime API promises 100 bytes, sends 7 and drops the connection: ReverseProxy itself
	// logs "read error during body copy" through its ErrorLog.
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "100")
		io.WriteString(w, "partial")
		w.(http.Flusher).Flush()
		conn, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			conn.Close()
		}
	}))
	t.Cleanup(api.Close)
	target, _ := url.Parse(api.URL)
	front := httptest.NewServer(bridge.NewHandler(target, nil, logger.Printf))
	t.Cleanup(front.Close)

	if resp, err := http.Get(front.URL + "/2018-06-01/runtime/invocation/next"); err == nil {
		io.ReadAll(resp.Body)
		resp.Body.Close()
	}
	deadline := time.Now().Add(2 * time.Second)
	for !strings.Contains(out.String(), "ReverseProxy read error") {
		if time.Now().After(deadline) {
			t.Fatalf("no ReverseProxy error was logged: %q", out.String())
		}
		time.Sleep(10 * time.Millisecond)
	}
	for _, line := range strings.Split(strings.TrimRight(out.String(), "\n"), "\n") {
		if !strings.HasPrefix(line, "[sls-dev-bridge] ") {
			t.Errorf("line without the bridge prefix: %q", line)
		}
	}
}
