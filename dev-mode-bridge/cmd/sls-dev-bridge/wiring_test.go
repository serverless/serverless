package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("broken pipe") }
func (failingWriter) Close() error              { return nil }

// A wrapper that can no longer read "ready" runs the runtime against the real Runtime API; the
// bridge must not stay behind holding the port.
func TestABridgeThatCannotSayReadyExitsAndFreesThePort(t *testing.T) {
	port := freePort(t)
	env := map[string]string{"SLS_DEV_REAL_RUNTIME_API": "127.0.0.1:1", "SLS_DEV_BRIDGE_PORT": strconv.Itoa(port)}
	err := run(func(k string) string { return env[k] }, failingWriter{}, func(string, ...any) {})
	if err == nil || !strings.Contains(err.Error(), "could not tell the wrapper") {
		t.Fatalf("%v", err)
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		t.Fatalf("the port is still held: %v", err)
	}
	ln.Close()
}

type lines struct {
	mu  sync.Mutex
	all []string
}

func (l *lines) logf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.all = append(l.all, fmt.Sprintf(format, args...))
}

func (l *lines) joined() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.all, "\n")
}

// An incomplete Dev Mode session (a variable missing) runs the deployed code and says why once.
func TestAnIncompleteSessionPassesThroughAndSaysWhy(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-1")
		io.WriteString(w, "{}")
	}))
	defer api.Close()
	port := freePort(t)
	env := map[string]string{
		"SLS_DEV_REAL_RUNTIME_API": strings.TrimPrefix(api.URL, "http://"),
		"SLS_DEV_BRIDGE_PORT":      strconv.Itoa(port),
		"SLS_DEV_SESSION":          "s_0123456789ab",
		"AWS_REGION":               "us-east-1",
	}
	logs := &lines{}
	pr, pw := io.Pipe()
	go func() { pw.CloseWithError(run(func(k string) string { return env[k] }, pw, logs.logf)) }()
	if line, err := bufio.NewReader(pr).ReadString('\n'); err != nil || line != "ready\n" {
		t.Fatalf("%q %v", line, err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/2018-06-01/runtime/invocation/next", port))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" {
		t.Fatalf("not passed through: %v", resp.Header)
	}
	got := logs.joined()
	if !strings.Contains(got, "the Dev Mode session is incomplete") || !strings.Contains(got, "invocations run the deployed code") {
		t.Fatalf("logs %q", got)
	}
	if n := strings.Count(got, "the Dev Mode session is incomplete"); n != 1 {
		t.Fatalf("said %d times", n)
	}
}
