package bridge

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type recordingRelayer struct {
	mu   sync.Mutex
	seen []Invocation
}

func (r *recordingRelayer) Handle(_ context.Context, inv Invocation) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seen = append(r.seen, inv)
	return false
}

func (r *recordingRelayer) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.seen)
}

type panickingRelayer struct{}

func (panickingRelayer) Handle(context.Context, Invocation) bool { panic("relay exploded") }

type logSink struct {
	mu    sync.Mutex
	lines []string
}

func (l *logSink) logf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, fmt.Sprintf(format, args...))
}

func (l *logSink) joined() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.lines, "\n")
}

// newBridge starts a fake Runtime API and the bridge in front of it.
func newBridge(t *testing.T, api http.Handler, router Relayer) (*httptest.Server, *httptest.Server, *logSink) {
	t.Helper()
	backend := httptest.NewServer(api)
	t.Cleanup(backend.Close)
	target, _ := url.Parse(backend.URL)
	logs := &logSink{}
	front := httptest.NewServer(NewHandler(target, router, logs.logf))
	t.Cleanup(front.Close)
	return front, backend, logs
}

const nextPath = "/2018-06-01/runtime/invocation/next"

func TestNextPassesEveryRuntimeHeaderAndTheEvent(t *testing.T) {
	headers := map[string]string{
		"Lambda-Runtime-Aws-Request-Id":       "req-1",
		"Lambda-Runtime-Deadline-Ms":          "1790675566345",
		"Lambda-Runtime-Invoked-Function-Arn": "arn:aws:lambda:us-east-1:123456789012:function:fn",
		"Lambda-Runtime-Trace-Id":             "Root=1-abc",
		"Lambda-Runtime-Client-Context":       "e30=",
		"Lambda-Runtime-Cognito-Identity":     "{}",
		"Lambda-Runtime-Aws-Tenant-Id":        "tenant-a",
	}
	router := &recordingRelayer{}
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != nextPath {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		for k, v := range headers {
			w.Header().Set(k, v)
		}
		io.WriteString(w, `{"hello":"world"}`)
	}), router)

	resp, err := http.Get(front.URL + nextPath)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"hello":"world"}` {
		t.Fatalf("body %q", body)
	}
	for k, v := range headers {
		if got := resp.Header.Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	if router.count() != 1 || router.seen[0].RequestID != "req-1" || router.seen[0].DeadlineMs != 1790675566345 {
		t.Fatalf("router saw %+v", router.seen)
	}
	for k, v := range headers {
		if got := router.seen[0].Headers.Get(k); got != v {
			t.Errorf("the relayer saw %s = %q, want %q", k, got, v)
		}
	}
	if string(router.seen[0].Body) != `{"hello":"world"}` {
		t.Errorf("the relayer saw the event %q", router.seen[0].Body)
	}
}

func TestAMalformedDeadlineIsUnknownNeverPast(t *testing.T) {
	for _, raw := range []string{"", "soon", "-5", "1.5"} {
		inv := invocationFrom(http.Header{"Lambda-Runtime-Deadline-Ms": {raw}, "Content-Type": {"x"}}, nil)
		if inv.DeadlineMs != 0 {
			t.Errorf("%q: deadline %d", raw, inv.DeadlineMs)
		}
		if inv.Headers.Get("Content-Type") != "" {
			t.Errorf("%q: a header that is not Lambda-Runtime-* reached the relayer", raw)
		}
	}
}

func TestAnEventAboveTheRelayLimitIsHandedOverWhole(t *testing.T) {
	event := strings.Repeat("e", MaxEventBytes+10)
	router := &recordingRelayer{}
	front, _, logs := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-big")
		io.WriteString(w, event)
	}), router)
	resp, err := http.Get(front.URL + nextPath)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if len(body) != len(event) || string(body) != event {
		t.Fatalf("the runtime got %d bytes, want %d", len(body), len(event))
	}
	if router.count() != 0 {
		t.Fatal("an event above the limit was offered to the relayer")
	}
	if !strings.Contains(logs.joined(), "req-big ran the deployed code") {
		t.Fatalf("logs %q", logs.joined())
	}
}

func TestResponseAndErrorPostsAreForwardedUnchanged(t *testing.T) {
	type got struct{ path, body, errType string }
	seen := make(chan got, 2)
	router := &recordingRelayer{}
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		seen <- got{r.URL.Path, string(b), r.Header.Get("Lambda-Runtime-Function-Error-Type")}
		w.WriteHeader(http.StatusAccepted)
	}), router)

	for _, c := range []got{
		{"/2018-06-01/runtime/invocation/req-1/response", `{"ok":true}`, ""},
		{"/2018-06-01/runtime/invocation/req-2/error", `{"errorType":"CheckError"}`, "CheckError"},
	} {
		req, _ := http.NewRequest(http.MethodPost, front.URL+c.path, strings.NewReader(c.body))
		if c.errType != "" {
			req.Header.Set("Lambda-Runtime-Function-Error-Type", c.errType)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusAccepted {
			t.Fatalf("status %d", resp.StatusCode)
		}
		if g := <-seen; g != c {
			t.Fatalf("backend saw %+v, want %+v", g, c)
		}
	}
	if router.count() != 0 {
		t.Fatalf("router must only see /next responses, saw %d", router.count())
	}
}

func TestStreamingResponseForwardsErrorTrailers(t *testing.T) {
	trailers := make(chan http.Header, 1)
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.ReadAll(r.Body) // trailer values exist only after the body is drained
		trailers <- r.Trailer.Clone()
		w.WriteHeader(http.StatusAccepted)
	}), &recordingRelayer{})

	pr, pw := io.Pipe()
	req, _ := http.NewRequest(http.MethodPost, front.URL+"/2018-06-01/runtime/invocation/req-1/response", pr)
	req.Header.Set("Lambda-Runtime-Function-Response-Mode", "streaming")
	req.Trailer = http.Header{"Lambda-Runtime-Function-Error-Type": nil, "Lambda-Runtime-Function-Error-Body": nil}
	go func() {
		io.WriteString(pw, "chunk-1")
		req.Trailer.Set("Lambda-Runtime-Function-Error-Type", "Error")
		req.Trailer.Set("Lambda-Runtime-Function-Error-Body", "eyJlcnJvck1lc3NhZ2UiOiJib29tIn0=")
		pw.Close()
	}()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	tr := <-trailers
	if tr.Get("Lambda-Runtime-Function-Error-Type") != "Error" || tr.Get("Lambda-Runtime-Function-Error-Body") == "" {
		t.Fatalf("trailers were not forwarded: %v", tr)
	}
}

func TestStreamedBodyIsNotBuffered(t *testing.T) {
	first := make(chan string, 1)
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 7)
		io.ReadFull(r.Body, buf)
		first <- string(buf)
		io.ReadAll(r.Body)
	}), &recordingRelayer{})

	pr, pw := io.Pipe()
	req, _ := http.NewRequest(http.MethodPost, front.URL+"/2018-06-01/runtime/invocation/req-1/response", pr)
	done := make(chan struct{})
	go func() {
		if resp, err := http.DefaultClient.Do(req); err == nil {
			resp.Body.Close()
		}
		close(done)
	}()
	io.WriteString(pw, "chunk-1")
	select {
	case s := <-first:
		if s != "chunk-1" {
			t.Fatalf("got %q", s)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the first chunk did not reach the Runtime API while the stream was open")
	}
	pw.Close()
	<-done
}

func TestConcurrentLongPollsAreProxiedIndependently(t *testing.T) {
	const n = 16 // Lambda Managed Instances run many /next long-polls per environment
	var inFlight, issued int32
	release := make(chan struct{})
	var once sync.Once
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&inFlight, 1) == n {
			once.Do(func() { close(release) })
		}
		<-release
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", fmt.Sprintf("req-%d", atomic.AddInt32(&issued, 1)))
	}), &recordingRelayer{})

	ids := make(chan string, n)
	for i := 0; i < n; i++ {
		go func() {
			resp, err := http.Get(front.URL + nextPath)
			if err != nil {
				ids <- ""
				return
			}
			resp.Body.Close()
			ids <- resp.Header.Get("Lambda-Runtime-Aws-Request-Id")
		}()
	}
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		select {
		case id := <-ids:
			seen[id] = true
		case <-time.After(5 * time.Second):
			t.Fatalf("only %d of %d long-polls completed", i, n)
		}
	}
	if len(seen) != n || seen[""] {
		t.Fatalf("ids %v", seen)
	}
}

func TestPanickingRelayerFallsBackToTheDeployedCode(t *testing.T) {
	front, _, logs := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-1")
		io.WriteString(w, "{}")
	}), panickingRelayer{})
	resp, err := http.Get(front.URL + nextPath)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if !strings.Contains(logs.joined(), "the deployed code answers") {
		t.Fatalf("logs: %s", logs.joined())
	}
}

func TestRuntimeAPIFailureIs502AndLogged(t *testing.T) {
	front, backend, logs := newBridge(t, http.NotFoundHandler(), &recordingRelayer{})
	backend.Close()
	resp, err := http.Get(front.URL + nextPath)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway || !strings.Contains(logs.joined(), "failed") {
		t.Fatalf("status %d logs %q", resp.StatusCode, logs.joined())
	}
}

func TestSnapStartRestoreNextPassesThroughWithoutRouting(t *testing.T) {
	router := &recordingRelayer{}
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/2018-06-01/runtime/restore/next" {
			t.Errorf("path %s", r.URL.Path)
		}
	}), router)
	resp, err := http.Get(front.URL + "/2018-06-01/runtime/restore/next")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || router.count() != 0 {
		t.Fatalf("status %d routed %d", resp.StatusCode, router.count())
	}
}
