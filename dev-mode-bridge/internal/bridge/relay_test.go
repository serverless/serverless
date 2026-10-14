package bridge

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws/mqttwstest"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

const (
	testSession = "s_0123456789ab"
	testEnv     = "e0123456789ab"
)

var testKey = bytes.Repeat([]byte{9}, 32)

var bridgeID = protocol.BridgeClientID(testSession, testEnv)

// fakeRuntimeAPI serves queued invocations on /next and records what is posted back.
type fakeRuntimeAPI struct {
	server *httptest.Server
	queue  chan fakeInvocation
	mu     sync.Mutex
	posts  []post
	posted chan post
	// tooLarge, when set, answers 413 to a /response body longer than it, as Lambda does above
	// its response limit.
	tooLarge atomic.Int64
	// nexts counts GET /next: the bridge fetches again only after the relay answered.
	nexts atomic.Int32
}

type fakeInvocation struct {
	id       string
	deadline string
	body     string
}

type post struct {
	path      string
	header    http.Header
	body      string
	errorType string
	trailer   http.Header
}

func newFakeRuntimeAPI(t *testing.T) *fakeRuntimeAPI {
	f := &fakeRuntimeAPI{queue: make(chan fakeInvocation, 16), posted: make(chan post, 64)}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/invocation/next") {
			f.nexts.Add(1)
			select {
			case inv := <-f.queue:
				w.Header().Set("Lambda-Runtime-Aws-Request-Id", inv.id)
				w.Header().Set("Lambda-Runtime-Deadline-Ms", inv.deadline)
				w.Header().Set("Lambda-Runtime-Invoked-Function-Arn", "arn:aws:lambda:us-east-1:123456789012:function:fn")
				io.WriteString(w, inv.body)
			case <-r.Context().Done():
			}
			return
		}
		body, _ := io.ReadAll(r.Body)
		p := post{path: r.URL.Path, header: r.Header.Clone(), body: string(body), errorType: r.Header.Get("Lambda-Runtime-Function-Error-Type"), trailer: r.Trailer.Clone()}
		f.mu.Lock()
		f.posts = append(f.posts, p)
		f.mu.Unlock()
		f.posted <- p
		if limit := f.tooLarge.Load(); limit > 0 && strings.HasSuffix(r.URL.Path, "/response") && int64(len(body)) > limit {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeRuntimeAPI) next(t *testing.T) post {
	t.Helper()
	select {
	case p := <-f.posted:
		return p
	case <-time.After(10 * time.Second):
		t.Fatal("nothing was posted to the Runtime API")
		return post{}
	}
}

func (f *fakeRuntimeAPI) all() []post {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]post{}, f.posts...)
}

func deadlineIn(d time.Duration) string {
	return fmt.Sprint(time.Now().Add(d).UnixMilli())
}

// waitFor polls a condition: tests wait for what they need, never for a guessed time.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// laptop is the developer's machine in these tests: it reads invoke frames and answers with
// whatever the test scripts.
type laptop struct {
	conn   *mqttws.Conn
	sealer *protocol.Sealer
	opener *protocol.Opener
	frames chan protocol.Frame
}

func newLaptop(t *testing.T, b *mqttwstest.Broker) *laptop {
	l := &laptop{sealer: protocol.NewSealer(testKey), opener: protocol.NewOpener(testKey), frames: make(chan protocol.Frame, 64)}
	conn, err := mqttws.Dial(context.Background(), mqttws.Options{
		URL:           func(context.Context) (string, error) { return b.URL(), nil },
		ClientID:      protocol.LaptopClientID(testSession),
		Subscriptions: []string{protocol.UpTopic(testSession)},
		OnMessage: func(m mqttws.Message) {
			if f, ok := l.opener.Open(m.Topic, m.Payload); ok {
				l.frames <- f
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	l.conn = conn
	return l
}

func (l *laptop) read(t *testing.T) protocol.Frame {
	t.Helper()
	select {
	case f := <-l.frames:
		return f
	case <-time.After(10 * time.Second):
		t.Fatal("the laptop got no frame")
		return protocol.Frame{}
	}
}

func (l *laptop) send(t *testing.T, h protocol.Header, body []byte) {
	t.Helper()
	topic := protocol.DownTopic(testSession, testEnv)
	payload, err := l.sealer.Seal(topic, h, body)
	if err != nil {
		t.Fatal(err)
	}
	if err := l.conn.Publish(context.Background(), topic, payload, 0); err != nil {
		t.Fatal(err)
	}
}

func goneFrame(t *testing.T, sealer *protocol.Sealer) []byte {
	t.Helper()
	payload, err := sealer.Seal(protocol.GoneTopic(testSession), protocol.Header{Kind: protocol.KindGone}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func (l *laptop) gone(t *testing.T) {
	t.Helper()
	if err := l.conn.Publish(context.Background(), protocol.GoneTopic(testSession), goneFrame(t, l.sealer), 0); err != nil {
		t.Fatal(err)
	}
}

type harness struct {
	api    *fakeRuntimeAPI
	broker *mqttwstest.Broker
	relay  *Relay
	front  *httptest.Server
	logs   *logSink
	live   atomic.Int32 // awsauth.Liveness
	pings  atomic.Int32
	dials  atomic.Int32
	skew   atomic.Int64 // added to the relay's clock, in nanoseconds
	ctx    context.Context

	dialMu    sync.Mutex
	dialTimes []time.Time // when each connect began, by the real clock
}

// dialGaps are the times between consecutive connects.
func (h *harness) dialGaps() []time.Duration {
	h.dialMu.Lock()
	defer h.dialMu.Unlock()
	var gaps []time.Duration
	for i := 1; i < len(h.dialTimes); i++ {
		gaps = append(gaps, h.dialTimes[i].Sub(h.dialTimes[i-1]))
	}
	return gaps
}

// harnessOptions change one collaborator of the relay; the zero value is the real broker.
type harnessOptions struct {
	timing    Timing
	dial      Dialer                                    // replaces dialing the test broker
	wrap      func(h *harness, c BrokerConn) BrokerConn // wraps each broker connection
	ping      func(h *harness) (awsauth.Liveness, error)
	retryable func(error) bool
	broker    func(b *mqttwstest.Broker) // changes the broker before the relay first connects
	onDial    func()                     // called as each connect begins, before it dials
}

func fastTiming() Timing {
	return Timing{
		ConnectWait:     2 * time.Second,
		IdleReconnect:   time.Minute,
		AcceptWindow:    600 * time.Millisecond,
		MinRemaining:    200 * time.Millisecond,
		MinAcceptWindow: 200 * time.Millisecond,
		LiveFor:         time.Minute,
		NotLiveFor:      time.Minute,
		SilenceCheck:    300 * time.Millisecond,
		UploadWait:      time.Second,
		AssumeRoleRetry: 0,
	}
}

func newHarness(t *testing.T, timing Timing) *harness {
	return newHarnessWith(t, harnessOptions{timing: timing})
}

func newHarnessWith(t *testing.T, o harnessOptions) *harness {
	h := &harness{api: newFakeRuntimeAPI(t), broker: mqttwstest.New(), logs: &logSink{}}
	t.Cleanup(h.broker.Close)
	if o.broker != nil {
		h.broker.Set(o.broker)
	}
	h.live.Store(int32(awsauth.Live))
	target, _ := url.Parse(h.api.server.URL)
	dial := func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (BrokerConn, error) {
		h.dials.Add(1)
		h.dialMu.Lock()
		h.dialTimes = append(h.dialTimes, time.Now())
		h.dialMu.Unlock()
		if o.onDial != nil {
			o.onDial()
		}
		if o.dial != nil {
			return o.dial(ctx, onMessage, onLost)
		}
		conn, err := mqttws.Dial(ctx, mqttws.Options{
			URL:           func(context.Context) (string, error) { return h.broker.URL(), nil },
			ClientID:      bridgeID,
			Subscriptions: []string{protocol.DownTopic(testSession, testEnv), protocol.GoneTopic(testSession)},
			PacketTimeout: time.Second,
			OnMessage:     onMessage,
			OnLost:        onLost,
		})
		if err != nil || o.wrap == nil {
			return conn, err
		}
		return o.wrap(h, conn), nil
	}
	h.relay = NewRelay(RelayDeps{
		Session: Session{ID: testSession, Key: testKey, Owner: "dev@laptop", FunctionName: "svc-dev-api", Environment: testEnv},
		Dial:    dial,
		Ping: func(context.Context) (awsauth.Liveness, error) {
			h.pings.Add(1)
			if o.ping != nil {
				return o.ping(h)
			}
			return awsauth.Liveness(h.live.Load()), nil
		},
		Retryable:   o.retryable,
		HTTP:        http.DefaultClient,
		Upstream:    NewUpstream(http.DefaultClient, target),
		Now:         func() time.Time { return time.Now().Add(time.Duration(h.skew.Load())) },
		Logf:        h.logs.logf,
		Environment: func() map[string]string { return map[string]string{"AWS_REGION": "us-east-1", "GREETING": "deployed"} },
		Timing:      o.timing,
	})
	h.relay.Start()
	h.front = httptest.NewServer(NewHandler(target, h.relay, h.logs.logf))
	// Cleanups run last first: end the runtime's pending /next, stop the relay (an invocation it
	// still waits for ends), then the front server can close.
	t.Cleanup(h.front.Close)
	t.Cleanup(h.relay.Close)
	ctx, cancel := context.WithCancel(context.Background())
	h.ctx = ctx
	t.Cleanup(cancel)
	return h
}

// runtimeNext is the runtime's own GET /next through the bridge, in the background.
func (h *harness) runtimeNext() chan *http.Response {
	out := make(chan *http.Response, 1)
	go func() {
		req, _ := http.NewRequestWithContext(h.ctx, http.MethodGet, h.front.URL+nextPath, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			out <- nil
			return
		}
		out <- resp
	}()
	return out
}

func waitResponse(t *testing.T, ch chan *http.Response) (*http.Response, string) {
	t.Helper()
	select {
	case resp := <-ch:
		if resp == nil {
			t.Fatal("the runtime's /next failed")
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return resp, string(body)
	case <-time.After(10 * time.Second):
		t.Fatal("the runtime's /next did not return")
		return nil, ""
	}
}

// keptByTheRelay asserts that the relay answered the invocation the runtime's request carried and
// never handed it to the deployed code: the bridge fetches the next invocation (fetch number
// `fetches`) only after the relay answered, and a hand-off would have ended the runtime's request
// with that invocation instead.
func (h *harness) keptByTheRelay(t *testing.T, runtime chan *http.Response, id string, fetches int32) {
	t.Helper()
	waitFor(t, "the bridge to fetch the next invocation", func() bool { return h.api.nexts.Load() >= fetches })
	select {
	case resp := <-runtime:
		if resp != nil && resp.Header.Get("Lambda-Runtime-Aws-Request-Id") == id {
			t.Fatalf("the deployed code got %s, which the machine ran", id)
		}
	default:
	}
}

// waitAccepted waits until the bridge holds the acceptance of id.
func (h *harness) waitAccepted(t *testing.T, id string) {
	t.Helper()
	waitFor(t, "the acceptance of "+id+" to reach the bridge", func() bool {
		h.relay.mu.Lock()
		defer h.relay.mu.Unlock()
		p := h.relay.pending[id]
		return p != nil && p.accepted
	})
}

// waitOpened waits until the relay has opened n frames in all.
func (h *harness) waitOpened(t *testing.T, n int64) {
	t.Helper()
	waitFor(t, fmt.Sprintf("%d frames to reach the bridge", n), func() bool { return h.relay.opened.Load() >= n })
}

func (h *harness) bridgeConnects() int {
	n := 0
	for _, id := range h.broker.Connects() {
		if id == bridgeID {
			n++
		}
	}
	return n
}

func (h *harness) bridgePublished() int {
	n := 0
	for _, p := range h.broker.Published() {
		if p.ClientID == bridgeID {
			n++
		}
	}
	return n
}

func TestATypedNilRelayPassesEverythingThrough(t *testing.T) {
	var relay *Relay
	front, _, _ := newBridge(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Lambda-Runtime-Aws-Request-Id", "req-1")
		io.WriteString(w, "{}")
	}), relay)
	resp, err := http.Get(front.URL + nextPath)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || string(body) != "{}" {
		t.Fatalf("runtime got %v %q", resp.Header, body)
	}
}

func TestALiveSessionAnswersAndTheRuntimeGetsTheNextInvocation(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"n":1}`}
	runtime := h.runtimeNext()

	f := l.read(t)
	if f.Header.Kind != protocol.KindInvoke || f.Header.ID != "req-1" || f.Header.Env != testEnv || f.Header.Fn != "svc-dev-api" || string(f.Body) != `{"n":1}` {
		t.Fatalf("invoke frame %+v %q", f.Header, f.Body)
	}
	if f.Header.Environment["GREETING"] != "deployed" || f.Header.Headers["lambda-runtime-invoked-function-arn"] == "" {
		t.Fatalf("environment or headers missing: %+v", f.Header)
	}
	if f.Header.RemainingMs <= 0 || f.Header.SentAt <= 0 {
		t.Fatalf("timing missing: %+v", f.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1", ContentType: "application/json"}, []byte(`{"from":"laptop"}`))
	p := h.api.next(t)
	if p.path != "/2018-06-01/runtime/invocation/req-1/response" || p.body != `{"from":"laptop"}` || p.header.Get("Content-Type") != "application/json" {
		t.Fatalf("posted %+v", p)
	}

	// The bridge polls again for the runtime; the second invocation runs the deployed code.
	h.live.Store(int32(awsauth.Gone))
	h.relay.live.set(awsauth.Gone)
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: `{"n":2}`}
	resp, body := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-2" || body != `{"n":2}` {
		t.Fatalf("runtime got %v %q", resp.Header, body)
	}
}

func TestTheInvokeFrameCarriesTheWireFieldsWithTheirTypes(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"n":1}`}
	h.runtimeNext()
	l.read(t)
	var raw []byte
	for _, p := range h.broker.Published() {
		if p.ClientID == bridgeID && p.Topic == protocol.UpTopic(testSession) {
			raw = p.Payload
			if p.QoS != 1 || p.Retain || p.Expiry == nil || *p.Expiry != 1 {
				t.Fatalf("published with QoS %d, retain %v, expiry %v", p.QoS, p.Retain, p.Expiry)
			}
		}
	}
	_, _, plaintext, err := protocol.OpenRaw(testKey, protocol.UpTopic(testSession), raw)
	if err != nil {
		t.Fatal(err)
	}
	var header map[string]any
	if err := json.Unmarshal(plaintext[:bytes.IndexByte(plaintext, '\n')], &header); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"kind", "env", "fn", "id"} {
		if _, ok := header[name].(string); !ok {
			t.Errorf("%s is %T, want a string", name, header[name])
		}
	}
	for _, name := range []string{"sentAt", "remainingMs"} {
		if n, ok := header[name].(float64); !ok || n < 1 || n != float64(int64(n)) {
			t.Errorf("%s is %v (%T), want a whole number of at least 1", name, header[name], header[name])
		}
	}
	for _, name := range []string{"headers", "environment"} {
		m, ok := header[name].(map[string]any)
		if !ok || len(m) == 0 {
			t.Fatalf("%s is %T, want an object", name, header[name])
		}
		for k, v := range m {
			if _, ok := v.(string); !ok {
				t.Errorf("%s.%s is %T, want a string", name, k, v)
			}
		}
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
}

func TestTheEnvironmentIsSentOnceThenOnlyWhenAsked(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	runtime := h.runtimeNext()
	for i, id := range []string{"a", "b"} {
		h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(30 * time.Second), body: "{}"}
		f := l.read(t)
		if (i == 0) != (f.Header.Environment != nil) {
			t.Fatalf("%s: environment sent %v", id, f.Header.Environment != nil)
		}
		if i == 1 {
			l.send(t, protocol.Header{Kind: protocol.KindNeedEnvironment, ID: id}, nil)
			again := l.read(t)
			if again.Header.ID != id || again.Header.Environment == nil {
				t.Fatalf("not resent with the environment: %+v", again.Header)
			}
		}
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: id}, []byte("null"))
		h.api.next(t)
	}
	_ = runtime
}

// The invoke sent again with the environment is a new offer: stamped when it is sent, with a
// window of its own, so the round trip of the machine's question is neither counted as the
// request's age on the machine nor taken out of the time it has to accept.
func TestTheInvokeSentAgainWithTheEnvironmentIsANewOffer(t *testing.T) {
	timing := fastTiming()
	timing.AcceptWindow = 2 * time.Second
	h := newHarness(t, timing)
	l := newLaptop(t, h.broker)
	runtime := h.runtimeNext()
	// The first invocation carries the environment; the second one does not.
	h.api.queue <- fakeInvocation{id: "first", deadline: deadlineIn(30 * time.Second), body: "{}"}
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "first"}, []byte("1"))
	h.api.next(t)
	deadline := time.Now().Add(30 * time.Second).UnixMilli()
	h.api.queue <- fakeInvocation{id: "req-1", deadline: fmt.Sprint(deadline), body: "{}"}
	offer := l.read(t)
	if offer.Header.Environment != nil {
		t.Fatalf("%+v", offer.Header)
	}
	time.Sleep(1200 * time.Millisecond)
	askedAt := time.Now().UnixMilli()
	l.send(t, protocol.Header{Kind: protocol.KindNeedEnvironment, ID: "req-1"}, nil)
	again := l.read(t)
	if again.Header.ID != "req-1" || again.Header.Environment == nil {
		t.Fatalf("not sent again with the environment: %+v", again.Header)
	}
	if again.Header.SentAt < askedAt {
		t.Fatalf("sentAt %d is the first offer's (%d), not when it was sent again (after %d)", again.Header.SentAt, offer.Header.SentAt, askedAt)
	}
	if got, want := again.Header.RemainingMs, deadline-again.Header.SentAt; got < want-1 || got > want {
		t.Fatalf("remainingMs %d, want %d (the deadline less sentAt)", got, want)
	}
	// Accepted after the first offer's window closed, within the new one.
	time.Sleep(1200 * time.Millisecond)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("2"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-1/response") {
		t.Fatalf("%+v; logs %q", p, h.logs.joined())
	}
	h.keptByTheRelay(t, runtime, "req-1", 3)
}

func TestNothingRanSoTheDeployedCodeAnswers(t *testing.T) {
	big := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
	cases := []struct {
		name  string
		event string
		opts  func(o *harnessOptions)
		setup func(h *harness)
		reply func(t *testing.T, h *harness, l *laptop, id string)
		log   string
		// notLog must not appear: a refusal is never counted as a possible double run, and a
		// possible double run is never logged as a refusal.
		notLog string
		// counted is how many counted lines (certain or possible double run) req-1 gets: 1 when
		// the machine may have the invoke, 0 when it cannot have run it.
		counted int
	}{
		{name: "session gone", setup: func(h *harness) { h.live.Store(int32(awsauth.Gone)) }, log: "the Dev Mode session is gone"},
		{name: "not accepted in time", reply: func(t *testing.T, h *harness, l *laptop, id string) { l.read(t) }, log: "not accepted within"},
		{name: "expired", reply: func(t *testing.T, h *harness, l *laptop, id string) {
			l.read(t)
			l.send(t, protocol.Header{Kind: protocol.KindExpired, ID: id}, nil)
		}, log: "(expired)"},
		{name: "not in dev", reply: func(t *testing.T, h *harness, l *laptop, id string) {
			l.read(t)
			l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: id}, nil)
		}, log: "(not_in_dev)"},
		{name: "publish refused", setup: func(h *harness) {
			h.broker.Set(func(b *mqttwstest.Broker) { b.PubackCode[protocol.UpTopic(testSession)] = 0x87 })
		}, log: "publishing it was refused", notLog: lostAcceptanceReason},
		{name: "publish ends the connection", opts: func(o *harnessOptions) {
			o.wrap = func(h *harness, c BrokerConn) BrokerConn {
				return &hookedConn{BrokerConn: c, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
					h.broker.Drop(bridgeID)
					<-c.Done()
					return real()
				}}
			}
		}, log: "req-1 ran the deployed code: " + lostAcceptanceReason, notLog: "publishing it was refused", counted: 1},
		{name: "publish again refused", reply: func(t *testing.T, h *harness, l *laptop, id string) {
			l.read(t)
			h.broker.Set(func(b *mqttwstest.Broker) { b.PubackCode[protocol.UpTopic(testSession)] = 0x87 })
			l.send(t, protocol.Header{Kind: protocol.KindNeedEnvironment, ID: id}, nil)
		}, log: "req-1 ran the deployed code: publishing it again was refused", notLog: mayAlsoHaveRunIt},
		{name: "publish again ends the connection", opts: func(o *harnessOptions) {
			o.wrap = func(h *harness, c BrokerConn) BrokerConn {
				return &hookedConn{BrokerConn: c, hookAt: 2, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
					h.broker.Drop(bridgeID)
					<-c.Done()
					return real()
				}}
			}
		}, reply: func(t *testing.T, h *harness, l *laptop, id string) {
			l.read(t)
			l.send(t, protocol.Header{Kind: protocol.KindNeedEnvironment, ID: id}, nil)
		}, log: "req-1 ran the deployed code: " + lostAcceptanceReason, notLog: "refused", counted: 1},
		{name: "no connection", opts: func(o *harnessOptions) {
			o.dial = func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
				return nil, errors.New("AWS IoT Core refused the CONNECT (reason code 0x87)")
			}
		}, log: "no connection to AWS IoT Core"},
		{name: "upload refused", event: big, reply: func(t *testing.T, h *harness, l *laptop, id string) {
			if f := l.read(t); f.Header.Kind != protocol.KindUploadURLRequest {
				t.Errorf("%+v", f.Header)
			}
			l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: id}, nil)
		}, log: "(not_in_dev)"},
		{name: "upload URL never arrives", event: big, reply: func(t *testing.T, h *harness, l *laptop, id string) { l.read(t) }, log: "no upload URL arrived"},
		{name: "upload fails", event: big, reply: func(t *testing.T, h *harness, l *laptop, id string) {
			l.read(t)
			// Without the encryption header the bucket requires, the fake refuses the upload.
			s3 := newFakeS3(t)
			l.send(t, protocol.Header{Kind: protocol.KindUploadURL, ID: id, Upload: &protocol.Upload{
				URL: s3.server.URL + "/in-1", Key: "serverless-dev-mode/svc/dev/" + testSession + "/in-1", TTLMs: 900_000,
			}}, nil)
		}, log: "uploading its event failed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			o := harnessOptions{timing: fastTiming()}
			if c.opts != nil {
				c.opts(&o)
			}
			h := newHarnessWith(t, o)
			l := newLaptop(t, h.broker)
			if c.setup != nil {
				c.setup(h)
			}
			event := c.event
			if event == "" {
				event = `{"x":1}`
			}
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: event}
			runtime := h.runtimeNext()
			if c.reply != nil {
				c.reply(t, h, l, "req-1")
			}
			resp, body := waitResponse(t, runtime)
			if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != event {
				t.Fatalf("runtime got %v and %d bytes", resp.Header, len(body))
			}
			if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code") || !strings.Contains(h.logs.joined(), c.log) {
				t.Fatalf("logs %q, want %q", h.logs.joined(), c.log)
			}
			if c.notLog != "" && strings.Contains(h.logs.joined(), c.notLog) {
				t.Fatalf("logs %q, must not hold %q", h.logs.joined(), c.notLog)
			}
			if n := h.countedLines("req-1"); n != c.counted {
				t.Fatalf("%d counted lines about req-1, want %d: %q", n, c.counted, h.logs.joined())
			}
			for _, p := range h.api.all() {
				if strings.Contains(p.path, "req-1") {
					t.Fatalf("the bridge also posted %+v", p)
				}
			}
		})
	}
}

func TestASessionThatIsGoneIsNeverOffered(t *testing.T) {
	h := newHarness(t, fastTiming())
	newLaptop(t, h.broker)
	h.live.Store(int32(awsauth.Gone))
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	waitResponse(t, h.runtimeNext())
	if n := h.bridgePublished(); n != 0 {
		t.Fatalf("the bridge published %d messages for a session that is gone", n)
	}
}

// An answer other than "gone" (no acknowledgement, a denied or failed check) counts as live: the
// invocation is offered and the acceptance window decides.
func TestAnUnansweredLivenessCheckStillOffersTheInvocation(t *testing.T) {
	for _, c := range []struct {
		state awsauth.Liveness
		err   error
	}{
		{awsauth.Unknown, nil},
		{awsauth.Denied, errors.New("operation error IoT Data Plane: SendDirectMessage, https response error StatusCode: 403")},
		{awsauth.Failed, errors.New("operation error IoT Data Plane: SendDirectMessage, exceeded maximum number of attempts")},
	} {
		t.Run(c.state.String(), func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), ping: func(*harness) (awsauth.Liveness, error) { return c.state, c.err }})
			l := newLaptop(t, h.broker)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
			h.runtimeNext()
			if f := l.read(t); f.Header.Kind != protocol.KindInvoke {
				t.Fatalf("%+v", f.Header)
			}
			l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
			l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
			if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-1/response") {
				t.Fatalf("%+v", p)
			}
		})
	}
}

func TestAGoneFrameMakesTheNextInvocationAskAgain(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
	if h.pings.Load() != 1 {
		t.Fatalf("%d liveness checks", h.pings.Load())
	}
	h.live.Store(int32(awsauth.Gone))
	opened := h.relay.opened.Load()
	l.gone(t)
	h.waitOpened(t, opened+1)

	// A minute-long cache would answer "live"; the gone frame makes the bridge ask again, and
	// the invocation runs the deployed code at once instead of waiting out the window.
	timing := fastTiming()
	start := time.Now()
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
	resp, _ := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-2" || h.pings.Load() != 2 {
		t.Fatalf("runtime got %v after %d liveness checks", resp.Header, h.pings.Load())
	}
	if !strings.Contains(h.logs.joined(), "req-2 ran the deployed code: the Dev Mode session is gone") || time.Since(start) >= timing.AcceptWindow*5 {
		t.Fatalf("logs %q after %v", h.logs.joined(), time.Since(start))
	}
}

// A gone frame may be a copy of an earlier goodbye (anyone on the broker can replay one): it only
// makes the bridge ask Direct Messaging, which decides.
func TestAReplayedGoneFrameNeverFailsALiveSession(t *testing.T) {
	earlier := goneFrame(t, protocol.NewSealer(testKey))
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	h.waitAccepted(t, "req-1")
	pings := h.pings.Load()
	opened := h.relay.opened.Load()
	h.broker.Send(protocol.GoneTopic(testSession), earlier)
	h.waitOpened(t, opened+1)
	waitFor(t, "a liveness check after the gone frame", func() bool { return h.pings.Load() > pings })
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-1/response") {
		t.Fatalf("%+v", p)
	}
	// The same copy again: dropped by the opener, nothing changes.
	h.broker.Send(protocol.GoneTopic(testSession), earlier)
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
	if f := l.read(t); f.Header.ID != "req-2" {
		t.Fatalf("%+v", f.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-2"}, []byte("2"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-2/response") {
		t.Fatalf("%+v", p)
	}
}

func TestNothingRanAfterAcceptanceStillRunsTheDeployedCode(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"x":1}`}
	runtime := h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: "req-1"}, nil)
	resp, body := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != `{"x":1}` {
		t.Fatalf("runtime got %v %q", resp.Header, body)
	}
	// A result after that contradicts it: the machine ran it after all. It is never posted, and
	// it is logged like a late acceptance.
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	waitFor(t, "the late result to be logged", func() bool {
		return strings.Contains(h.logs.joined(), "req-1 was accepted after it had already run the deployed code")
	})
	if posts := h.api.all(); len(posts) != 0 {
		t.Fatalf("posted %+v", posts)
	}
}

// The machine's acceptance reached the bridge, but the machine's connection dropped before the
// broker acknowledged it, so the machine ran nothing. Once it reconnects (so Direct Messaging says
// live), it says expired: the deployed code answers at once instead of the caller waiting for the
// function's deadline, nothing is posted, and nothing is counted as a possible double run.
func TestAnAcceptanceTheMachineThenSaysItDidNotRunRunsTheDeployedCodeAtOnce(t *testing.T) {
	timing := fastTiming()
	// Only the machine's expired can end the wait in time; silence checks answer live.
	timing.SilenceCheck = 200 * time.Millisecond
	h := newHarness(t, timing)
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"x":1}`}
	runtime := h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	h.waitAccepted(t, "req-1")
	start := time.Now()
	h.broker.Drop(protocol.LaptopClientID(testSession))
	again := newLaptop(t, h.broker)
	// A few silence checks pass with the machine live again.
	waitFor(t, "liveness checks after the reconnect", func() bool { return h.pings.Load() >= 3 })
	again.send(t, protocol.Header{Kind: protocol.KindExpired, ID: "req-1"}, nil)
	resp, body := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != `{"x":1}` {
		t.Fatalf("runtime got %v %q", resp.Header, body)
	}
	if took := time.Since(start); took > 10*time.Second {
		t.Fatalf("the deployed code got it after %s", took)
	}
	if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: the developer's machine did not run it (expired)") {
		t.Fatalf("logs %q", h.logs.joined())
	}
	if n := h.countedLines("req-1"); n != 0 {
		t.Fatalf("%d counted lines: %q", n, h.logs.joined())
	}
	if posts := h.api.all(); len(posts) != 0 {
		t.Fatalf("posted %+v", posts)
	}
}

// Part of a result means the machine ran it: a refusal after that never hands it to the deployed
// code.
func TestARefusalAfterPartOfAResultIsIgnored(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	opened := h.relay.opened.Load()
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamStart, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1"}, []byte("a"))
	h.waitOpened(t, opened+3)
	l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: "req-1"}, nil)
	h.waitOpened(t, opened+4)
	l.send(t, protocol.Header{Kind: protocol.KindStreamEnd, ID: "req-1", Count: 1}, nil)
	if p := h.api.next(t); p.body != "a" || !strings.HasSuffix(p.path, "/req-1/response") {
		t.Fatalf("%+v", p)
	}
	h.keptByTheRelay(t, runtime, "req-1", 2)
}

func TestALateAcceptanceIsIgnoredAndLogged(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	waitResponse(t, runtime)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	deadline := time.Now().Add(3 * time.Second)
	for !strings.Contains(h.logs.joined(), "accepted after it had already run the deployed code") {
		if time.Now().After(deadline) {
			t.Fatalf("logs %q", h.logs.joined())
		}
		time.Sleep(20 * time.Millisecond)
	}
	if posts := h.api.all(); len(posts) != 0 {
		t.Fatalf("posted %+v", posts)
	}
}

// The acceptance window closes in one step under the relay's lock: an acceptance (or a reply) that
// reached the bridge before it wins, however close; one after it is late, never lost unlogged.
func TestAnAcceptanceThatReachedTheBridgeBeforeTheWindowClosedWins(t *testing.T) {
	logs := &logSink{}
	r := NewRelay(RelayDeps{
		Session: Session{ID: testSession, Key: testKey, Owner: "dev@laptop", Environment: testEnv},
		Logf:    logs.logf,
		Timing:  fastTiming(),
	})
	defer r.Close()
	sealer := protocol.NewSealer(testKey)
	deliver := func(h protocol.Header) {
		topic := protocol.DownTopic(testSession, testEnv)
		payload, err := sealer.Seal(topic, h, []byte("1"))
		if err != nil {
			t.Fatal(err)
		}
		r.receive(mqttws.Message{Topic: topic, Payload: payload})
	}
	for _, kind := range []string{protocol.KindAccepted, protocol.KindResponse, protocol.KindStreamData} {
		p, ok := r.register("in-time-" + kind)
		if !ok {
			t.Fatal("not registered")
		}
		deliver(protocol.Header{Kind: kind, ID: "in-time-" + kind})
		if r.withdraw(p) {
			t.Fatalf("%s: the window closed over an acceptance that had arrived", kind)
		}
	}
	p, _ := r.register("late")
	deliver(protocol.Header{Kind: protocol.KindNeedEnvironment, ID: "late"})
	if !r.withdraw(p) {
		t.Fatal("a frame that is not an acceptance kept the window open")
	}
	deliver(protocol.Header{Kind: protocol.KindAccepted, ID: "late"})
	deliver(protocol.Header{Kind: protocol.KindResponse, ID: "late"})
	if got := strings.Count(logs.joined(), "late was accepted after it had already run the deployed code"); got != 1 {
		t.Fatalf("logged %d times: %q", got, logs.joined())
	}
	// A hand-off already logged with a counted line is never counted a second time.
	p, _ = r.register("counted")
	if !r.withdrawCounting(p, true) {
		t.Fatal("not withdrawn")
	}
	deliver(protocol.Header{Kind: protocol.KindAccepted, ID: "counted"})
	if strings.Contains(logs.joined(), "counted was accepted after") {
		t.Fatalf("counted twice: %q", logs.joined())
	}
}

func TestTooLittleTimeLeftRunsTheDeployedCodeAndAnUnknownDeadlineIsRelayed(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "near", deadline: deadlineIn(100 * time.Millisecond), body: "{}"}
	_, _ = waitResponse(t, h.runtimeNext())
	h.api.queue <- fakeInvocation{id: "unknown", deadline: "not-a-number", body: "{}"}
	h.runtimeNext()
	f := l.read(t)
	if f.Header.ID != "unknown" || f.Header.RemainingMs != 0 {
		t.Fatalf("%+v", f.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "unknown"}, []byte("1"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/unknown/response") {
		t.Fatalf("%+v", p)
	}
}

func TestAReplyThatOvertakesItsAcceptanceCounts(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindError, ID: "req-1", ErrorType: "Error"}, []byte(`{"errorType":"Error","errorMessage":"boom"}`))
	p := h.api.next(t)
	if p.path != "/2018-06-01/runtime/invocation/req-1/error" || p.errorType != "Error" || !strings.Contains(p.body, "boom") {
		t.Fatalf("%+v", p)
	}
	// The acceptance arrives after the invocation is over: it is not a late acceptance, since
	// nothing ran twice.
	waitFor(t, "the invocation to end", func() bool {
		h.relay.mu.Lock()
		defer h.relay.mu.Unlock()
		return h.relay.pending["req-1"] == nil
	})
	opened := h.relay.opened.Load()
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	h.waitOpened(t, opened+1)
	if strings.Contains(h.logs.joined(), "accepted after it had already run the deployed code") {
		t.Fatalf("logs %q", h.logs.joined())
	}
}

func TestAnAcceptedInvocationFailsWhenTheSessionGoes(t *testing.T) {
	for _, how := range []string{"gone frame", "silence"} {
		t.Run(how, func(t *testing.T) {
			timing := fastTiming()
			if how == "gone frame" {
				// No silence check comes in time: only the gone frame can end it.
				timing.SilenceCheck = time.Minute
			}
			h := newHarness(t, timing)
			l := newLaptop(t, h.broker)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
			h.runtimeNext()
			l.read(t)
			l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
			h.waitAccepted(t, "req-1")
			h.live.Store(int32(awsauth.Gone))
			if how == "gone frame" {
				l.gone(t)
			}
			p := h.api.next(t)
			if p.errorType != "Runtime.DevModeDisconnected" || !strings.Contains(p.body, testSession) || !strings.Contains(p.body, "dev@laptop") || !strings.Contains(p.body, "not run again") {
				t.Fatalf("%+v", p)
			}
		})
	}
}

// Only Direct Messaging's "gone" fails an accepted invocation: a machine that is live, or that
// does not acknowledge (frozen, asleep), or a question that is denied or fails, keeps it waiting.
func TestSilenceAloneNeverFailsALiveSession(t *testing.T) {
	for _, state := range []awsauth.Liveness{awsauth.Live, awsauth.Unknown, awsauth.Denied, awsauth.Failed} {
		t.Run(state.String(), func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), ping: func(h *harness) (awsauth.Liveness, error) {
				if h.pings.Load() == 1 {
					return awsauth.Live, nil
				}
				return state, nil
			}})
			l := newLaptop(t, h.broker)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
			h.runtimeNext()
			l.read(t)
			l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
			// One check before the invoke, then at least three during the silence.
			waitFor(t, "three liveness checks during the silence", func() bool { return h.pings.Load() >= 4 })
			l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
			if p := h.api.next(t); !strings.HasSuffix(p.path, "/response") {
				t.Fatalf("%+v", p)
			}
		})
	}
}

func TestTheConnectionEndingAfterAcceptanceFailsTheInvocation(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	h.waitAccepted(t, "req-1")
	h.broker.Drop(bridgeID)
	p := h.api.next(t)
	if p.errorType != "Runtime.DevModeDisconnected" || !strings.Contains(p.body, testSession) || !strings.Contains(p.body, "dev@laptop") || !strings.Contains(p.body, "not run again") {
		t.Fatalf("%+v", p)
	}
	// The next invocation connects again and is relayed.
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
	if f := l.read(t); f.Header.ID != "req-2" {
		t.Fatalf("%+v", f.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-2"}, []byte("1"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-2/response") {
		t.Fatalf("%+v", p)
	}
	if h.bridgeConnects() < 2 {
		t.Fatalf("the bridge connected %d times", h.bridgeConnects())
	}
}

func TestAConnectionEndingBeforeAcceptanceRunsTheDeployedCodeAtOnce(t *testing.T) {
	timing := fastTiming()
	timing.AcceptWindow = 20 * time.Second
	h := newHarness(t, timing)
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(60 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	start := time.Now()
	h.broker.Drop(bridgeID)
	resp, _ := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || time.Since(start) > 10*time.Second {
		t.Fatalf("runtime got %v after %v", resp.Header, time.Since(start))
	}
	if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: "+lostAcceptanceReason) || strings.Contains(h.logs.joined(), "publishing it was refused") {
		t.Fatalf("logs %q", h.logs.joined())
	}
}

// hookedConn intercepts one Publish on the connection (the first, or the hookAt-th); real
// publishes for real.
type hookedConn struct {
	BrokerConn
	// neverDone hides the end of the connection, so a test can tell the relay stopping from the
	// connection ending.
	neverDone bool
	hookAt    int32
	count     atomic.Int32
	publish   func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error
}

func (c *hookedConn) Done() <-chan struct{} {
	if c.neverDone {
		return nil
	}
	return c.BrokerConn.Done()
}

func (c *hookedConn) Publish(ctx context.Context, topic string, payload []byte, expiry uint32) error {
	real := func() error { return c.BrokerConn.Publish(ctx, topic, payload, expiry) }
	if c.count.Add(1) != max(c.hookAt, 1) {
		return real()
	}
	return c.publish(ctx, topic, payload, expiry, real)
}

// countedLines are the lines about id that the live tests count as a double run, certain or
// possible.
func (h *harness) countedLines(id string) int {
	n := 0
	for _, line := range strings.Split(h.logs.joined(), "\n") {
		if strings.HasPrefix(line, id+" ") && (strings.Contains(line, "was accepted after it had already run the deployed code") || strings.Contains(line, mayAlsoHaveRunIt)) {
			n++
		}
	}
	return n
}

// A publish whose PUBACK did not come in time may still have been delivered: the bridge waits
// out the window on that connection, so an acceptance is never lost to a hasty pass-through.
func TestAPublishThatTimedOutButArrivedIsNotRunTwice(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), wrap: func(h *harness, c BrokerConn) BrokerConn {
		return &hookedConn{BrokerConn: c, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
			if err := real(); err != nil {
				return err
			}
			return fmt.Errorf("publishing to AWS IoT Core: %w", context.DeadlineExceeded)
		}}
	}})
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-1/response") {
		t.Fatalf("%+v", p)
	}
	h.keptByTheRelay(t, runtime, "req-1", 2)
	// The suspect connection is replaced before the next relay.
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-2"}, []byte("2"))
	h.api.next(t)
	if h.bridgeConnects() < 2 {
		t.Fatalf("the bridge connected %d times", h.bridgeConnects())
	}
}

// One acceptance window, counted from the offer: a publish whose PUBACK never
// comes uses it up, and the deployed code gets the invocation when it ends, never a second window
// later and never past the point where too little time is left to run it.
func TestAPublishThatIsNeverAcknowledgedHandsOffWithinOneWindow(t *testing.T) {
	timing := fastTiming()
	// At 500 ms the cap binds: the window ends 300 ms in (deadline − MinRemaining), not at 600 ms.
	for _, lambdaDeadline := range []time.Duration{500 * time.Millisecond, 1100 * time.Millisecond, 3 * time.Second} {
		t.Run(lambdaDeadline.String(), func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: timing, wrap: func(h *harness, c BrokerConn) BrokerConn {
				return &hookedConn{BrokerConn: c, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
					<-ctx.Done()
					return fmt.Errorf("publishing to AWS IoT Core: %w", ctx.Err())
				}}
			}})
			waitFor(t, "the bridge to connect", func() bool { return h.broker.Connected(bridgeID) })
			start := time.Now()
			deadline := start.Add(lambdaDeadline)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: fmt.Sprint(deadline.UnixMilli()), body: "{}"}
			resp, _ := waitResponse(t, h.runtimeNext())
			handedOff := time.Since(start)
			// One window, capped so that the deployed code keeps MinRemaining, and a little slack
			// for the round trips (two windows would be 1.2 s; an uncapped window at 500 ms, 600 ms).
			limit := min(lambdaDeadline-timing.MinRemaining, timing.AcceptWindow) + 150*time.Millisecond
			if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || handedOff > limit {
				t.Fatalf("the deployed code got it after %v, want within %v", handedOff, limit)
			}
			if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: its publish was not acknowledged and no acceptance arrived within") || h.countedLines("req-1") != 1 {
				t.Fatalf("logs %q", h.logs.joined())
			}
		})
	}
}

// A publish the broker delivered but never acknowledged: the machine has the invocation, and its
// acceptance comes after the window. The bridge has handed it to the deployed code and dropped the
// distrusted connection, so that acceptance never arrives; the hand-off itself is counted, once.
func TestADeliveredButUnacknowledgedPublishIsCountedOnce(t *testing.T) {
	for _, c := range []struct {
		name   string
		hookAt int32
	}{{"the invoke", 1}, {"the invoke sent again with the environment", 2}} {
		t.Run(c.name, func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), wrap: func(h *harness, conn BrokerConn) BrokerConn {
				return &hookedConn{BrokerConn: conn, hookAt: c.hookAt, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
					if err := real(); err != nil {
						return err
					}
					<-ctx.Done() // the PUBACK never comes
					return fmt.Errorf("publishing to AWS IoT Core: %w", ctx.Err())
				}}
			}})
			l := newLaptop(t, h.broker)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"x":1}`}
			runtime := h.runtimeNext()
			l.read(t)
			if c.hookAt == 2 {
				l.send(t, protocol.Header{Kind: protocol.KindNeedEnvironment, ID: "req-1"}, nil)
				if f := l.read(t); f.Header.Environment == nil {
					t.Fatalf("not sent again with the environment: %+v", f.Header)
				}
			}
			resp, body := waitResponse(t, runtime)
			if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != `{"x":1}` {
				t.Fatalf("runtime got %v %q", resp.Header, body)
			}
			// The machine accepts after the window; then the next invocation, on a new connection,
			// runs on the machine, by when anything about req-1 would have arrived.
			l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
			l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
			h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
			runtime = h.runtimeNext()
			if f := l.read(t); f.Header.ID != "req-2" {
				t.Fatalf("%+v", f.Header)
			}
			l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-2"}, []byte("2"))
			if p := h.api.next(t); !strings.HasSuffix(p.path, "/req-2/response") {
				t.Fatalf("%+v", p)
			}
			if n := h.countedLines("req-1"); n != 1 {
				t.Fatalf("%d counted lines about req-1 in %q", n, h.logs.joined())
			}
			if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: its publish was not acknowledged and no acceptance arrived within") {
				t.Fatalf("logs %q", h.logs.joined())
			}
		})
	}
}

// Close while the bridge waits for the acceptance of an invoke whose publish was not acknowledged:
// the machine may have it, so the hand-off is counted, once.
func TestCloseAfterAnUnacknowledgedPublishIsCountedOnce(t *testing.T) {
	timing := fastTiming()
	timing.AcceptWindow = 20 * time.Second
	h := newHarnessWith(t, harnessOptions{timing: timing, wrap: func(h *harness, c BrokerConn) BrokerConn {
		return &hookedConn{BrokerConn: c, neverDone: true, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
			if err := real(); err != nil {
				return err
			}
			return fmt.Errorf("publishing to AWS IoT Core: %w", context.DeadlineExceeded)
		}}
	}})
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(60 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t)
	// The publish has returned once the environment is marked sent; then the bridge waits.
	waitFor(t, "the publish to return", func() bool {
		h.relay.mu.Lock()
		defer h.relay.mu.Unlock()
		return h.relay.envSentAt != -1
	})
	h.relay.Close()
	resp, _ := waitResponse(t, runtime)
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" {
		t.Fatalf("runtime got %v", resp.Header)
	}
	if n := h.countedLines("req-1"); n != 1 || !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: the relay has stopped (its publish was not acknowledged") {
		t.Fatalf("%d counted lines: %q", n, h.logs.joined())
	}
}

// Below the shortest useful acceptance window, the invocation is never offered: a window of a few
// milliseconds would only time out its publish and drop the connection.
func TestTooLittleTimeForAUsefulWindowIsNeverOffered(t *testing.T) {
	t.Run("when it arrives", func(t *testing.T) {
		h := newHarness(t, fastTiming()) // MinRemaining 200 ms, MinAcceptWindow 200 ms
		newLaptop(t, h.broker)
		waitFor(t, "the bridge to connect", func() bool { return h.broker.Connected(bridgeID) })
		// 350 ms left: the window could only be 150 ms (the deadline less MinRemaining).
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(350 * time.Millisecond), body: "{}"}
		resp, _ := waitResponse(t, h.runtimeNext())
		if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || h.bridgePublished() != 0 {
			t.Fatalf("runtime got %v; the bridge published %d", resp.Header, h.bridgePublished())
		}
		if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: too little time left to relay it") {
			t.Fatalf("logs %q", h.logs.joined())
		}
	})
	t.Run("a large event, without asking for an upload URL", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		newLaptop(t, h.broker)
		waitFor(t, "the bridge to connect", func() bool { return h.broker.Connected(bridgeID) })
		event := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(350 * time.Millisecond), body: event}
		resp, _ := waitResponse(t, h.runtimeNext())
		if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || h.bridgePublished() != 0 {
			t.Fatalf("runtime got %v; the bridge published %d", resp.Header, h.bridgePublished())
		}
	})
	t.Run("after its event went to S3", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		l := newLaptop(t, h.broker)
		s3 := newFakeS3(t)
		waitFor(t, "the bridge to connect", func() bool { return h.broker.Connected(bridgeID) })
		event := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
		// 500 ms left is enough when it arrives; the upload then takes 200 ms of the relay's
		// clock, which leaves a window of about 100 ms: never offered.
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(500 * time.Millisecond), body: event}
		runtime := h.runtimeNext()
		if ask := l.read(t); ask.Header.Kind != protocol.KindUploadURLRequest {
			t.Fatalf("%+v", ask.Header)
		}
		h.skew.Add(int64(200 * time.Millisecond))
		key := "serverless-dev-mode/svc/dev/" + testSession + "/in-1"
		l.send(t, protocol.Header{Kind: protocol.KindUploadURL, ID: "req-1", Upload: &protocol.Upload{
			URL: s3.server.URL + "/" + key, Headers: map[string]string{"x-amz-server-side-encryption": "aws:kms"}, Key: key, TTLMs: 900_000,
		}}, nil)
		resp, body := waitResponse(t, runtime)
		if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != event {
			t.Fatalf("runtime got %v and %d bytes", resp.Header, len(body))
		}
		if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: too little time left to relay it") {
			t.Fatalf("logs %q", h.logs.joined())
		}
	})
}

func TestAStreamIsReorderedDeduplicatedAndEndsWithItsTrailers(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	// Data before its start, out of order and duplicated; the end before the last data frame.
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: 1}, []byte("b"))
	l.send(t, protocol.Header{Kind: protocol.KindStreamStart, ID: "req-1", ContentType: "text/plain"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: 0}, []byte("a"))
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: 0}, []byte("a"))
	errBody := base64.StdEncoding.EncodeToString([]byte(`{"errorType":"Error","errorMessage":"mid-stream"}`))
	l.send(t, protocol.Header{Kind: protocol.KindStreamEnd, ID: "req-1", Count: 3, ErrorType: "Error", ErrorBody: errBody}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: 2}, []byte("c"))
	p := h.api.next(t)
	if p.path != "/2018-06-01/runtime/invocation/req-1/response" || p.body != "abc" {
		t.Fatalf("%+v", p)
	}
	if p.header.Get("Lambda-Runtime-Function-Response-Mode") != "streaming" || p.header.Get("Content-Type") != "text/plain" {
		t.Fatalf("headers %v", p.header)
	}
	if p.trailer.Get("Lambda-Runtime-Function-Error-Type") != "Error" || p.trailer.Get("Lambda-Runtime-Function-Error-Body") != errBody {
		t.Fatalf("trailers %v", p.trailer)
	}
}

func TestAStreamEndsWithTheDisconnectErrorWhenTheSessionGoes(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	opened := h.relay.opened.Load()
	l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamStart, ID: "req-1", ContentType: "text/plain"}, nil)
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1"}, []byte("partial"))
	h.waitOpened(t, opened+3)
	h.live.Store(int32(awsauth.Gone))
	l.gone(t)
	p := h.api.next(t)
	if p.body != "partial" || p.trailer.Get("Lambda-Runtime-Function-Error-Type") != "Runtime.DevModeDisconnected" {
		t.Fatalf("%+v", p)
	}
	raw, err := base64.StdEncoding.DecodeString(p.trailer.Get("Lambda-Runtime-Function-Error-Body"))
	if err != nil || !strings.Contains(string(raw), testSession) || !strings.Contains(string(raw), "not run again") {
		t.Fatalf("error body %q %v", raw, err)
	}
}

func TestAStreamThatOverflowsTheReorderBufferFails(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindStreamStart, ID: "req-1"}, nil)
	// Frame 0 never comes: frames 1 to maxHeldFrames+1 pile up.
	for n := 1; n <= maxHeldFrames+1; n++ {
		l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: n}, []byte("x"))
	}
	p := h.api.next(t)
	if p.trailer.Get("Lambda-Runtime-Function-Error-Type") != "Runtime.DevModeRelayFailed" {
		t.Fatalf("%+v", p)
	}
}

func TestCopiesOfAWrittenStreamFrameNeverFillTheBuffer(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindStreamStart, ID: "req-1"}, nil)
	// More frames than the buffer holds, each written at once, then a copy of every one.
	frames := maxHeldFrames + 2
	var want strings.Builder
	for n := range frames {
		want.WriteString(fmt.Sprint(n % 10))
		l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: n}, []byte(fmt.Sprint(n%10)))
	}
	for n := range frames {
		l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: n}, []byte(fmt.Sprint(n%10)))
	}
	// A frame held for its turn keeps the first content that came for its number.
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: frames + 1}, []byte("b"))
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: frames + 1}, []byte("X"))
	l.send(t, protocol.Header{Kind: protocol.KindStreamData, ID: "req-1", N: frames}, []byte("a"))
	l.send(t, protocol.Header{Kind: protocol.KindStreamEnd, ID: "req-1", Count: frames + 2}, nil)
	p := h.api.next(t)
	if p.body != want.String()+"ab" || p.trailer.Get("Lambda-Runtime-Function-Error-Type") != "" {
		t.Fatalf("body %q, trailers %v", p.body, p.trailer)
	}
}

// Every error the relay posts is redacted before it is encoded: as an invocation error, and in a
// stream's error trailer.
func TestEveryErrorBodyIsRedactedBeforeItIsEncoded(t *testing.T) {
	const leaky = `S3 said "https://bucket.s3.amazonaws.com/k?X-Amz-Credential=ASIASECRET&X-Amz-Signature=SECRETSIG"`
	api := newFakeRuntimeAPI(t)
	target, _ := url.Parse(api.server.URL)
	r := NewRelay(RelayDeps{Session: Session{ID: testSession, Key: testKey, Owner: "dev@laptop", Environment: testEnv}, Upstream: NewUpstream(http.DefaultClient, target), Timing: fastTiming()})
	defer r.Close()
	for _, streamed := range []bool{false, true} {
		st := &relayed{inv: Invocation{RequestID: fmt.Sprint("req-", streamed)}}
		if streamed {
			st.stream = r.d.Upstream.stream(context.Background(), st.inv.RequestID, "")
		}
		if _, err := r.failWith(st, "Runtime.DevModeRelayFailed", leaky); err != nil {
			t.Fatal(err)
		}
		p := api.next(t)
		text := p.body + p.trailer.Get("Lambda-Runtime-Function-Error-Type")
		if raw, err := base64.StdEncoding.DecodeString(p.trailer.Get("Lambda-Runtime-Function-Error-Body")); err == nil {
			text += string(raw)
		}
		if !strings.Contains(text, "Runtime.DevModeRelayFailed") || !strings.Contains(text, "S3 said") {
			t.Fatalf("streamed %v: no error in %+v", streamed, p)
		}
		for _, secret := range []string{"X-Amz-", "SECRET", "://"} {
			if strings.Contains(text, secret) {
				t.Fatalf("streamed %v: %q reached %q", streamed, secret, text)
			}
		}
	}
}

// fakeS3 stores objects by path and honours PUT, GET and DELETE on presigned-looking URLs.
type fakeS3 struct {
	server  *httptest.Server
	mu      sync.Mutex
	objects map[string][]byte
	deleted []string
}

func newFakeS3(t *testing.T) *fakeS3 {
	s := &fakeS3{objects: map[string][]byte{}}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		switch r.Method {
		case http.MethodPut:
			if r.Header.Get("X-Amz-Server-Side-Encryption") != "aws:kms" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			body, _ := io.ReadAll(r.Body)
			s.objects[r.URL.Path] = body
			w.Header().Set("X-Amz-Version-Id", "v1")
		case http.MethodGet:
			body, ok := s.objects[r.URL.Path]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Write(body)
		case http.MethodDelete:
			delete(s.objects, r.URL.Path)
			s.deleted = append(s.deleted, r.URL.Path+"?"+r.URL.RawQuery)
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	t.Cleanup(s.server.Close)
	return s
}

func TestAnEventLargerThanOneMessageGoesThroughS3(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	s3 := newFakeS3(t)
	event := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: event}
	h.runtimeNext()
	ask := l.read(t)
	if ask.Header.Kind != protocol.KindUploadURLRequest || ask.Header.ID != "req-1" {
		t.Fatalf("%+v", ask.Header)
	}
	key := "serverless-dev-mode/svc/dev/" + testSession + "/in-1"
	l.send(t, protocol.Header{Kind: protocol.KindUploadURL, ID: "req-1", Upload: &protocol.Upload{
		URL: s3.server.URL + "/" + key + "?X-Amz-Signature=x", Headers: map[string]string{"x-amz-server-side-encryption": "aws:kms"}, Key: key, TTLMs: 900_000,
	}}, nil)
	f := l.read(t)
	if f.Header.Kind != protocol.KindInvoke || f.Header.S3 == nil || f.Header.S3.Key != key || f.Header.S3.VersionID != "v1" || len(f.Body) != 0 {
		t.Fatalf("%+v", f.Header)
	}
	s3.mu.Lock()
	stored := s3.objects["/"+key]
	s3.mu.Unlock()
	_, _, plaintext, err := protocol.OpenRaw(testKey, "s3/"+key, stored)
	if err != nil {
		t.Fatalf("the object is not sealed for its key: %v", err)
	}
	if _, body, _ := protocol.DecodeFrame(plaintext); string(body) != event {
		t.Fatal("the stored event differs")
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
	// The URL was for that event only: the next large event asks again.
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: event}
	if ask := l.read(t); ask.Header.Kind != protocol.KindUploadURLRequest || ask.Header.ID != "req-2" {
		t.Fatalf("an upload URL was used twice: %+v", ask.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: "req-2"}, nil)
}

// The developer's machine measures how late an invoke is from sentAt, and the acceptance window
// starts at the offer: the time an upload (or a reconnect) takes before it is not the invoke's age.
func TestTheInvokeIsStampedWhenItIsOffered(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	const putTakes = 800 * time.Millisecond
	var putDone atomic.Int64
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		time.Sleep(putTakes)
		putDone.Store(time.Now().UnixMilli())
		w.Header().Set("X-Amz-Version-Id", "v1")
	}))
	t.Cleanup(slow.Close)
	deadline := time.Now().Add(30 * time.Second).UnixMilli()
	event := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
	h.api.queue <- fakeInvocation{id: "req-1", deadline: fmt.Sprint(deadline), body: event}
	h.runtimeNext()
	if ask := l.read(t); ask.Header.Kind != protocol.KindUploadURLRequest {
		t.Fatalf("%+v", ask.Header)
	}
	l.send(t, protocol.Header{Kind: protocol.KindUploadURL, ID: "req-1", Upload: &protocol.Upload{
		URL: slow.URL + "/in-1?X-Amz-Signature=x", Key: "in-1", TTLMs: 900_000,
	}}, nil)
	f := l.read(t)
	if f.Header.Kind != protocol.KindInvoke || f.Header.S3 == nil {
		t.Fatalf("%+v", f.Header)
	}
	if done := putDone.Load(); f.Header.SentAt < done {
		t.Fatalf("sentAt %d is %d ms before the upload ended", f.Header.SentAt, done-f.Header.SentAt)
	}
	// Both are whole milliseconds of the same instant: they agree to within the one truncated.
	if got, want := f.Header.RemainingMs, deadline-f.Header.SentAt; got < want-1 || got > want {
		t.Fatalf("remainingMs %d, want %d (the deadline less sentAt)", got, want)
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
}

func TestASpareUploadURLIsUsedOnceWithoutAsking(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	s3 := newFakeS3(t)
	key := "serverless-dev-mode/svc/dev/" + testSession + "/spare-1"
	h.api.queue <- fakeInvocation{id: "small", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "small", Upload: &protocol.Upload{
		URL: s3.server.URL + "/" + key, Headers: map[string]string{"x-amz-server-side-encryption": "aws:kms"}, Key: key, TTLMs: 900_000,
	}}, []byte("1"))
	h.api.next(t)
	event := `{"big":"` + strings.Repeat("x", 200_000) + `"}`
	for i, id := range []string{"big-1", "big-2"} {
		h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(30 * time.Second), body: event}
		f := l.read(t)
		if i == 0 && (f.Header.Kind != protocol.KindInvoke || f.Header.S3 == nil || f.Header.S3.Key != key) {
			t.Fatalf("the spare was not used: %+v", f.Header)
		}
		if i == 1 {
			if f.Header.Kind != protocol.KindUploadURLRequest {
				t.Fatalf("a spare was used twice: %+v", f.Header)
			}
			l.send(t, protocol.Header{Kind: protocol.KindNotInDev, ID: id}, nil)
			break
		}
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: id}, []byte("1"))
		h.api.next(t)
	}
}

func TestAResponseInS3IsDownloadedOpenedAndDeleted(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	s3 := newFakeS3(t)
	key := "serverless-dev-mode/svc/dev/" + testSession + "/out-1"
	big := []byte(`{"big":"` + strings.Repeat("y", 300_000) + `"}`)
	sealed, _ := protocol.NewSealer(testKey).Seal("s3/"+key, protocol.Header{Kind: protocol.KindPayload}, big)
	s3.objects["/"+key] = sealed
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1", ContentType: "application/json", S3: &protocol.S3Object{
		Key: key, Get: s3.server.URL + "/" + key + "?sig=get", Delete: s3.server.URL + "/" + key + "?versionId=v9&sig=del",
	}}, nil)
	p := h.api.next(t)
	if p.body != string(big) {
		t.Fatalf("posted %d bytes", len(p.body))
	}
	s3.mu.Lock()
	defer s3.mu.Unlock()
	if len(s3.deleted) != 1 || !strings.Contains(s3.deleted[0], "versionId=v9") {
		t.Fatalf("deleted %v", s3.deleted)
	}
}

func TestAnObjectSwappedForAnotherKeysIsRefused(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	s3 := newFakeS3(t)
	key := "serverless-dev-mode/svc/dev/" + testSession + "/out-1"
	sealed, _ := protocol.NewSealer(testKey).Seal("s3/serverless-dev-mode/svc/dev/"+testSession+"/other", protocol.Header{Kind: protocol.KindPayload}, []byte("swapped"))
	s3.objects["/"+key] = sealed
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1", S3: &protocol.S3Object{Key: key, Get: s3.server.URL + "/" + key}}, nil)
	p := h.api.next(t)
	if p.errorType != "Runtime.DevModeRelayFailed" || strings.Contains(p.body, "swapped") {
		t.Fatalf("%+v", p)
	}
}

func TestAResultLargerThanLambdaAllowsIsFunctionResponseSizeTooLarge(t *testing.T) {
	t.Run("inline, refused by the Runtime API", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		h.api.tooLarge.Store(100)
		l := newLaptop(t, h.broker)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
		h.runtimeNext()
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, bytes.Repeat([]byte("z"), 200))
		if p := h.api.next(t); !strings.HasSuffix(p.path, "/response") {
			t.Fatalf("%+v", p)
		}
		p := h.api.next(t)
		if !strings.HasSuffix(p.path, "/req-1/error") || p.errorType != "Function.ResponseSizeTooLarge" {
			t.Fatalf("%+v", p)
		}
	})
	t.Run("in S3, above what the bridge reads", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		l := newLaptop(t, h.broker)
		s3 := newFakeS3(t)
		key := "serverless-dev-mode/svc/dev/" + testSession + "/huge"
		s3.objects["/"+key] = bytes.Repeat([]byte("h"), MaxObjectBytes+1)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
		h.runtimeNext()
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1", S3: &protocol.S3Object{
			Key: key, Get: s3.server.URL + "/" + key, Delete: s3.server.URL + "/" + key + "?versionId=v1",
		}}, nil)
		p := h.api.next(t)
		if !strings.HasSuffix(p.path, "/req-1/error") || p.errorType != "Function.ResponseSizeTooLarge" {
			t.Fatalf("%s %s %.200s", p.path, p.errorType, p.body)
		}
		s3.mu.Lock()
		defer s3.mu.Unlock()
		if len(s3.deleted) != 1 {
			t.Fatalf("deleted %v", s3.deleted)
		}
	})
}

// relayWithIdleBetween relays two invocations the laptop answers and, after each, moves the relay's
// clock past `idle` (no real waiting), so the second one finds the connection idle and connects
// again.
func (h *harness) relayWithIdleBetween(t *testing.T, l *laptop, idle time.Duration) {
	t.Helper()
	h.runtimeNext()
	for _, id := range []string{"a", "b"} {
		h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(30 * time.Second), body: "{}"}
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: id}, []byte("1"))
		h.api.next(t)
		waitFor(t, "the invocation to release the connection", func() bool {
			h.relay.link.mu.Lock()
			defer h.relay.link.mu.Unlock()
			return h.relay.link.active == 0
		})
		h.skew.Add(int64(idle + time.Millisecond))
	}
}

func TestAnIdleConnectionIsReplacedBeforeTheNextRelay(t *testing.T) {
	timing := fastTiming()
	timing.IdleReconnect = 300 * time.Millisecond
	h := newHarness(t, timing)
	h.relayWithIdleBetween(t, newLaptop(t, h.broker), timing.IdleReconnect)
	if n := h.bridgeConnects(); n < 2 {
		t.Fatalf("the bridge connected %d times", n)
	}
}

func TestEveryOutcomeIsOneLogLine(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
	linesAbout := func(id string) []string {
		var lines []string
		for _, line := range strings.Split(h.logs.joined(), "\n") {
			if strings.Contains(line, id) {
				lines = append(lines, line)
			}
		}
		return lines
	}
	waitFor(t, "the outcome line", func() bool { return len(linesAbout("req-1")) > 0 })
	h.relay.Close() // every line about req-1 is written by now
	lines := linesAbout("req-1")
	if len(lines) != 1 || !strings.Contains(lines[0], "ran on dev@laptop's machine: response in") {
		t.Fatalf("lines %q", lines)
	}
}

// Presigned S3 and AWS IoT Core URLs carry credentials: no URL, and no SigV4 parameter, reaches
// the function's log or the error a caller sees.
func TestNoURLOrSignatureReachesTheLogsOrTheCaller(t *testing.T) {
	closed := func() string {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		addr := ln.Addr().String()
		ln.Close()
		return "http://" + addr
	}
	const signed = "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIASECRETCRED%2F20261002%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Security-Token=SECRETTOKEN&X-Amz-Signature=SECRETSIG"
	check := func(t *testing.T, h *harness) {
		t.Helper()
		texts := []string{h.logs.joined()}
		for _, p := range h.api.all() {
			texts = append(texts, p.body, fmt.Sprint(p.header), fmt.Sprint(p.trailer))
		}
		for _, text := range texts {
			for _, secret := range []string{"X-Amz-", "x-amz-credential", "SECRET", "://"} {
				if strings.Contains(text, secret) {
					t.Fatalf("%q reached %q", secret, text)
				}
			}
		}
	}

	t.Run("connect", func(t *testing.T) {
		h := newHarnessWith(t, harnessOptions{timing: fastTiming(), dial: func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
			return nil, &url.Error{Op: "GET", URL: "wss://example-ats.iot.us-east-1.amazonaws.com/mqtt" + signed, Err: errors.New("dial tcp: i/o timeout")}
		}})
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
		waitResponse(t, h.runtimeNext())
		if !strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core: GET: dial tcp: i/o timeout") {
			t.Fatalf("logs %q", h.logs.joined())
		}
		check(t, h)
	})
	t.Run("upload", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		l := newLaptop(t, h.broker)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"big":"` + strings.Repeat("x", 200_000) + `"}`}
		runtime := h.runtimeNext()
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindUploadURL, ID: "req-1", Upload: &protocol.Upload{URL: closed() + "/in-1" + signed, Key: "in-1", TTLMs: 900_000}}, nil)
		waitResponse(t, runtime)
		if !strings.Contains(h.logs.joined(), "uploading its event failed") {
			t.Fatalf("logs %q", h.logs.joined())
		}
		check(t, h)
	})
	t.Run("download", func(t *testing.T) {
		h := newHarness(t, fastTiming())
		l := newLaptop(t, h.broker)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
		h.runtimeNext()
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1", S3: &protocol.S3Object{Key: "out-1", Get: closed() + "/out-1" + signed}}, nil)
		p := h.api.next(t)
		if p.errorType != "Runtime.DevModeRelayFailed" || !strings.Contains(p.body, "connection refused") {
			t.Fatalf("%+v", p)
		}
		waitFor(t, "the outcome line", func() bool { return strings.Contains(h.logs.joined(), "req-1 ran on dev@laptop's machine, but") })
		check(t, h)
	})
}

// AWS IoT Core accepts about one CONNECT per second per client id and refuses more with reason
// code 0x97 (quota exceeded): the bridge connects again after at least a second, and the
// invocation waiting for the connection is still relayed.
func TestAConnectRefusedForQuotaIsTriedAgainAfterASecond(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), broker: func(b *mqttwstest.Broker) { b.ConnackCode = 0x97 }})
	waitFor(t, "the first connect", func() bool { return h.bridgeConnects() >= 1 })
	h.broker.Set(func(b *mqttwstest.Broker) { b.ConnackCode = 0 })
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	if p := h.api.next(t); p.path != "/2018-06-01/runtime/invocation/req-1/response" {
		t.Fatalf("posted %+v", p)
	}
	gaps := h.dialGaps()
	if len(gaps) != 1 || gaps[0] < time.Second {
		t.Fatalf("connects %d apart %v", len(gaps)+1, gaps)
	}
	if logs := h.logs.joined(); !strings.Contains(logs, "AWS IoT Core refused the CONNECT (reason code 0x97); connecting again in") {
		t.Fatalf("logs %q", logs)
	}
}

// A connection that ends right after it was made is not replaced within the same second.
func TestAQuickDropIsNotFollowedByAConnectWithinASecond(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	// Connected and subscribed: the link holds the connection.
	waitFor(t, "the bridge to connect", func() bool {
		h.relay.link.mu.Lock()
		defer h.relay.link.mu.Unlock()
		return h.relay.link.conn != nil
	})
	h.broker.Drop(bridgeID)
	waitFor(t, "the bridge to notice", func() bool {
		h.relay.link.mu.Lock()
		defer h.relay.link.mu.Unlock()
		return h.relay.link.conn == nil
	})
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	h.api.next(t)
	if gaps := h.dialGaps(); len(gaps) != 1 || gaps[0] < time.Second {
		t.Fatalf("connects %d apart %v", len(gaps)+1, gaps)
	}
}

// A broker that keeps refusing for a quota is asked a bounded number of times, each later than
// the last, and then the invocations run the deployed code for a while.
// The CONNECT is sent at the end of a dial (after AssumeRole and the WebSocket handshake), so a
// slow refused dial is still followed by at least a second's wait before the next one begins.
func TestASlowRefusedConnectIsStillFollowedByASecondsWait(t *testing.T) {
	var mu sync.Mutex
	var ended time.Time
	attempts := atomic.Int32{}
	// Set before the relay starts, so the dialer may read it.
	var broker *mqttwstest.Broker
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), broker: func(b *mqttwstest.Broker) { broker = b }, dial: func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (BrokerConn, error) {
		if attempts.Add(1) == 1 {
			time.Sleep(1200 * time.Millisecond)
			mu.Lock()
			ended = time.Now()
			mu.Unlock()
			return nil, mqttws.ReasonError{Packet: "CONNECT", Code: 0x97}
		}
		return mqttws.Dial(ctx, mqttws.Options{
			URL:           func(context.Context) (string, error) { return broker.URL(), nil },
			ClientID:      bridgeID,
			Subscriptions: []string{protocol.DownTopic(testSession, testEnv), protocol.GoneTopic(testSession)},
			PacketTimeout: time.Second,
			OnMessage:     onMessage,
			OnLost:        onLost,
		})
	}})
	waitFor(t, "the second connect", func() bool { return attempts.Load() >= 2 })
	h.dialMu.Lock()
	second := h.dialTimes[1]
	h.dialMu.Unlock()
	mu.Lock()
	defer mu.Unlock()
	if gap := second.Sub(ended); gap < time.Second {
		t.Fatalf("the next connect began %v after the refusal", gap)
	}
}

func TestAConnectRefusedForQuotaIsNotRetriedInALoop(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), broker: func(b *mqttwstest.Broker) { b.ConnackCode = 0x96 }})
	waitFor(t, "the bridge to give up", func() bool { return strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core") })
	gaps := h.dialGaps()
	if len(gaps) != 2 || gaps[0] < time.Second || gaps[1] < 2*time.Second {
		t.Fatalf("connects %d apart %v", len(gaps)+1, gaps)
	}
	if n := strings.Count(h.logs.joined(), "AWS IoT Core refused the CONNECT (reason code 0x96); connecting again in"); n != 2 {
		t.Fatalf("%d retry lines in %q", n, h.logs.joined())
	}
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	resp, _ := waitResponse(t, h.runtimeNext())
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || h.bridgeConnects() != 3 {
		t.Fatalf("runtime got %v after %d connects", resp.Header, h.bridgeConnects())
	}
}

func TestARetryableConnectFailureNeverDelaysInvocations(t *testing.T) {
	timing := fastTiming()
	timing.ConnectWait = 8 * time.Second
	timing.AssumeRoleRetry = time.Hour
	attempts := atomic.Int32{}
	h := newHarnessWith(t, harnessOptions{timing: timing, retryable: func(error) bool { return true }, dial: func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
		attempts.Add(1)
		return nil, errors.New("operation error STS: AssumeRole, AccessDenied")
	}})
	waitFor(t, "the first connect attempt", func() bool { return attempts.Load() >= 1 })
	start := time.Now()
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	resp, _ := waitResponse(t, h.runtimeNext())
	if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || time.Since(start) > timing.ConnectWait/2 {
		t.Fatalf("runtime got %v after %v", resp.Header, time.Since(start))
	}
	// Close stops the retries at once.
	closed := make(chan struct{})
	go func() { h.relay.Close(); close(closed) }()
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("Close waited for the retries")
	}
}

// Every connect attempt that fails is logged with its cause, not only the last one: a bridge that
// keeps retrying while invocations run the deployed code says why.
func TestEveryFailedConnectAttemptIsLoggedWithItsCause(t *testing.T) {
	timing := fastTiming()
	timing.AssumeRoleRetry = time.Hour
	attempts := atomic.Int32{}
	h := newHarnessWith(t, harnessOptions{timing: timing, retryable: func(error) bool { return true }, dial: func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
		return nil, fmt.Errorf("operation error STS: AssumeRole, AccessDenied: attempt %d", attempts.Add(1))
	}})
	waitFor(t, "two connect attempts", func() bool { return attempts.Load() >= 2 })
	waitFor(t, "both attempts in the logs", func() bool {
		logs := h.logs.joined()
		return strings.Contains(logs, "AccessDenied: attempt 1") && strings.Contains(logs, "AccessDenied: attempt 2")
	})
	for _, line := range strings.Split(h.logs.joined(), "\n") {
		if strings.Contains(line, "AccessDenied: attempt 1") && !strings.Contains(line, "could not connect to AWS IoT Core yet") {
			t.Fatalf("line %q", line)
		}
	}
}

// deniedUntilAllowed dials the test broker once allow is set, and fails like an AssumeRole that IAM
// does not let through yet before that.
func deniedUntilAllowed(allow *atomic.Bool, broker **mqttwstest.Broker) Dialer {
	return func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (BrokerConn, error) {
		if !allow.Load() {
			return nil, errors.New("operation error STS: AssumeRole, AccessDenied")
		}
		return mqttws.Dial(ctx, mqttws.Options{
			URL:           func(context.Context) (string, error) { return (*broker).URL(), nil },
			ClientID:      bridgeID,
			Subscriptions: []string{protocol.DownTopic(testSession, testEnv), protocol.GoneTopic(testSession)},
			PacketTimeout: time.Second,
			OnMessage:     onMessage,
			OnLost:        onLost,
		})
	}
}

// A broker role IAM lets in only after the retry window: an invocation a little later finds the
// bridge connecting again and is relayed, instead of the environment running the deployed code
// for another minute.
func TestARetryableFailurePastTheRetryWindowIsTriedAgainSoon(t *testing.T) {
	var allow atomic.Bool
	var broker *mqttwstest.Broker
	h := newHarnessWith(t, harnessOptions{
		timing:    fastTiming(), // no retry window: the first failure is already past it
		retryable: func(error) bool { return true },
		broker:    func(b *mqttwstest.Broker) { broker = b },
		dial:      deniedUntilAllowed(&allow, &broker),
	})
	waitFor(t, "the first connect to fail", func() bool { return strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core: ") })
	allow.Store(true)
	h.skew.Store(int64(20 * time.Second))
	l := newLaptop(t, broker)
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(time.Minute), body: "{}"}
	h.runtimeNext()
	l.read(t)
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: "req-1"}, []byte("1"))
	if p := h.api.next(t); p.path != "/2018-06-01/runtime/invocation/req-1/response" {
		t.Fatalf("posted %+v", p)
	}
}

// Past the retry window an invocation tries to connect only once the backoff since the last failed
// attempt has passed, the backoff doubles up to its bound, and every invocation in between runs
// the deployed code at once.
func TestPastTheRetryWindowInvocationsRetryWithABoundedBackoff(t *testing.T) {
	var allow atomic.Bool
	var broker *mqttwstest.Broker
	h := newHarnessWith(t, harnessOptions{
		timing:    fastTiming(),
		retryable: func(error) bool { return true },
		broker:    func(b *mqttwstest.Broker) { broker = b },
		dial:      deniedUntilAllowed(&allow, &broker),
	})
	waitFor(t, "the first connect to fail", func() bool { return strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core: ") })
	n := 0
	invokeAt := func(at time.Duration) {
		t.Helper()
		h.skew.Store(int64(at))
		n++
		id := fmt.Sprintf("req-%d", n)
		h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(at + time.Minute), body: "{}"}
		start := time.Now()
		resp, _ := waitResponse(t, h.runtimeNext())
		if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != id || time.Since(start) > time.Second {
			t.Fatalf("runtime got %v after %v", resp.Header, time.Since(start))
		}
	}
	dials := func(want int32) {
		t.Helper()
		if got := h.dials.Load(); got != want {
			t.Fatalf("%d connect attempts, want %d; logs %q", got, want, h.logs.joined())
		}
	}
	// The backoffs after each failed attempt: 1, 2, 4, 8, then 15 s from then on.
	at := time.Duration(0)
	for i, backoff := range []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 15 * time.Second, 15 * time.Second} {
		invokeAt(at + backoff - 100*time.Millisecond)
		dials(int32(i + 1))
		at += backoff + 100*time.Millisecond
		invokeAt(at)
		dials(int32(i + 2))
	}
	if n := strings.Count(h.logs.joined(), "could not connect to AWS IoT Core: "); n != 7 {
		t.Fatalf("%d failed attempts logged in %q", n, h.logs.joined())
	}
}

// isConnected says whether the link holds a connection.
func (h *harness) isConnected() bool {
	h.relay.link.mu.Lock()
	defer h.relay.link.mu.Unlock()
	return h.relay.link.conn != nil
}

// windowTiming has a retry window that lasts the whole test.
func windowTiming() Timing {
	timing := fastTiming()
	timing.AssumeRoleRetry = time.Hour
	return timing
}

// Inside the retry window AWS IoT Core refusing to authorize the connection, as it does while a
// new broker role's permissions are being applied, is tried again in the background within the
// backoff, and the bridge connects once it is let in.
func TestAnAuthorizationRefusalInsideTheRetryWindowIsTriedAgain(t *testing.T) {
	refusals := map[string]func(b *mqttwstest.Broker){
		"CONNECT 0x87":  func(b *mqttwstest.Broker) { b.ConnackCode = 0x87 },
		"handshake 401": func(b *mqttwstest.Broker) { b.HandshakeStatus = http.StatusUnauthorized },
		"handshake 403": func(b *mqttwstest.Broker) { b.HandshakeStatus = http.StatusForbidden },
	}
	for name, refuse := range refusals {
		t.Run(name, func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: windowTiming(), retryable: awsauth.Retryable, broker: refuse})
			waitFor(t, "a second connect attempt", func() bool { return h.dials.Load() >= 2 })
			gaps := h.dialGaps()
			if gaps[0] < time.Second || gaps[0] > 3*time.Second {
				t.Fatalf("connects %v apart", gaps)
			}
			logs := h.logs.joined()
			if !strings.Contains(logs, "could not connect to AWS IoT Core yet: ") || !strings.Contains(logs, "; trying again in 1 s") {
				t.Fatalf("logs %q", logs)
			}
			h.broker.Set(func(b *mqttwstest.Broker) { b.ConnackCode, b.HandshakeStatus = 0, 0 })
			waitFor(t, "the bridge to connect", h.isConnected)
		})
	}
}

// Past the retry window an authorization refusal is taken as lasting: invocations run the
// deployed code without trying to connect for a minute, then one tries again.
func TestAnAuthorizationRefusalPastTheRetryWindowRestsAMinute(t *testing.T) {
	refusals := map[string]func(b *mqttwstest.Broker){
		"CONNECT 0x87":  func(b *mqttwstest.Broker) { b.ConnackCode = 0x87 },
		"handshake 403": func(b *mqttwstest.Broker) { b.HandshakeStatus = http.StatusForbidden },
	}
	for name, refuse := range refusals {
		t.Run(name, func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), retryable: awsauth.Retryable, broker: refuse})
			waitFor(t, "the first connect to fail", func() bool {
				return strings.Contains(h.logs.joined(), "; invocations run the deployed code")
			})
			h.broker.Set(func(b *mqttwstest.Broker) { b.ConnackCode, b.HandshakeStatus = 0, 0 })
			n := 0
			invokeAt := func(at time.Duration) {
				t.Helper()
				h.skew.Store(int64(at))
				n++
				id := fmt.Sprintf("req-%d", n)
				h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(at + time.Minute), body: "{}"}
				resp, _ := waitResponse(t, h.runtimeNext())
				if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != id {
					t.Fatalf("runtime got %v", resp.Header)
				}
			}
			for _, at := range []time.Duration{time.Second, 20 * time.Second, 59 * time.Second} {
				invokeAt(at)
				if got := h.dials.Load(); got != 1 {
					t.Fatalf("%d connect attempts %v after the refusal; logs %q", got, at, h.logs.joined())
				}
			}
			invokeAt(61 * time.Second)
			waitFor(t, "the connect a minute later", h.isConnected)
			if got := h.dials.Load(); got != 2 {
				t.Fatalf("%d connect attempts", got)
			}
		})
	}
}

// A WebSocket upgrade answered with a server error or a throttle may pass with time: inside the
// retry window it is tried again in the background, and past it the first invocation after the
// backoff connects again, instead of invocations running the deployed code for a minute.
func TestAHandshakeAnsweredWithAServerErrorIsTriedAgainWithTheBackoff(t *testing.T) {
	statuses := map[string]int{
		"handshake 500": http.StatusInternalServerError,
		"handshake 503": http.StatusServiceUnavailable,
		"handshake 429": http.StatusTooManyRequests,
	}
	for name, status := range statuses {
		t.Run(name+" inside the retry window", func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: windowTiming(), retryable: awsauth.Retryable, broker: func(b *mqttwstest.Broker) { b.HandshakeStatus = status }})
			waitFor(t, "a second connect attempt", func() bool { return h.dials.Load() >= 2 })
			logs := h.logs.joined()
			if !strings.Contains(logs, "could not connect to AWS IoT Core yet: ") || !strings.Contains(logs, "; trying again in 1 s") {
				t.Fatalf("logs %q", logs)
			}
			h.broker.Set(func(b *mqttwstest.Broker) { b.HandshakeStatus = 0 })
			waitFor(t, "the bridge to connect", h.isConnected)
		})
		t.Run(name+" past the retry window", func(t *testing.T) {
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), retryable: awsauth.Retryable, broker: func(b *mqttwstest.Broker) { b.HandshakeStatus = status }})
			waitFor(t, "the first connect to fail", func() bool {
				return strings.Contains(h.logs.joined(), "; invocations run the deployed code, and the first after 1 s connects again")
			})
			h.broker.Set(func(b *mqttwstest.Broker) { b.HandshakeStatus = 0 })
			h.skew.Store(int64(time.Second + 100*time.Millisecond))
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(2 * time.Minute), body: "{}"}
			waitResponse(t, h.runtimeNext())
			waitFor(t, "the connect after the backoff", h.isConnected)
			if got := h.dials.Load(); got != 2 {
				t.Fatalf("%d connect attempts; logs %q", got, h.logs.joined())
			}
		})
	}
}

// Nothing the relay started outlives Close, an invocation it was still waiting for included.
func TestNoGoroutineOutlivesClose(t *testing.T) {
	settle := func(want int) int {
		var n int
		for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
			if n = runtime.NumGoroutine(); n <= want {
				return n
			}
		}
		return n
	}
	before := settle(runtime.NumGoroutine())
	func() {
		api := newFakeRuntimeAPIStandalone()
		defer api.server.Close()
		broker := mqttwstest.New()
		defer broker.Close()
		client := &http.Client{Transport: &http.Transport{}}
		defer client.Transport.(*http.Transport).CloseIdleConnections()
		target, _ := url.Parse(api.server.URL)
		logs := &logSink{}
		relay := NewRelay(RelayDeps{
			Session: Session{ID: testSession, Key: testKey, Owner: "dev@laptop", FunctionName: "fn", Environment: testEnv},
			Dial: func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (BrokerConn, error) {
				return mqttws.Dial(ctx, mqttws.Options{
					URL:           func(context.Context) (string, error) { return broker.URL(), nil },
					ClientID:      bridgeID,
					Subscriptions: []string{protocol.DownTopic(testSession, testEnv), protocol.GoneTopic(testSession)},
					OnMessage:     onMessage,
					OnLost:        onLost,
				})
			},
			Ping:     func(context.Context) (awsauth.Liveness, error) { return awsauth.Live, nil },
			HTTP:     client,
			Upstream: NewUpstream(client, target),
			Logf:     logs.logf,
			Timing:   fastTiming(),
		})
		relay.Start()
		laptopConn, frames := standaloneLaptop(t, broker)
		defer laptopConn.Close()
		handled := make(chan bool, 1)
		go func() {
			handled <- relay.Handle(context.Background(), Invocation{RequestID: "req-1", DeadlineMs: time.Now().Add(30 * time.Second).UnixMilli(), Body: []byte("{}")})
		}()
		select {
		case <-frames:
		case <-time.After(10 * time.Second):
			t.Fatal("the laptop got no invoke frame")
		}
		sealer := protocol.NewSealer(testKey)
		topic := protocol.DownTopic(testSession, testEnv)
		payload, _ := sealer.Seal(topic, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
		if err := laptopConn.Publish(context.Background(), topic, payload, 0); err != nil {
			t.Fatal(err)
		}
		waitFor(t, "the acceptance", func() bool {
			relay.mu.Lock()
			defer relay.mu.Unlock()
			p := relay.pending["req-1"]
			return p != nil && p.accepted
		})
		relay.Close()
		// Close returned: the invocation it was waiting for has ended, and its error is posted.
		select {
		case h := <-handled:
			if !h {
				t.Fatal("an accepted invocation was handed to the deployed code")
			}
		default:
			t.Fatal("Close returned before the invocation under way ended")
		}
		select {
		case p := <-api.posted:
			if p.errorType != "Runtime.DevModeRelayFailed" {
				t.Fatalf("%+v", p)
			}
		default:
			t.Fatal("Close returned before the invocation's error was posted")
		}
		if relay.Handle(context.Background(), Invocation{RequestID: "req-2"}) {
			t.Fatal("a closed relay took an invocation")
		}
	}()
	http.DefaultTransport.(*http.Transport).CloseIdleConnections()
	if after := settle(before); after > before {
		buf := make([]byte, 1<<20)
		t.Fatalf("%d goroutines before, %d after:\n%s", before, after, buf[:runtime.Stack(buf, true)])
	}
}

func newFakeRuntimeAPIStandalone() *fakeRuntimeAPI {
	f := &fakeRuntimeAPI{posted: make(chan post, 16)}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		f.posted <- post{path: r.URL.Path, body: string(body), errorType: r.Header.Get("Lambda-Runtime-Function-Error-Type")}
		w.WriteHeader(http.StatusAccepted)
	}))
	return f
}

func standaloneLaptop(t *testing.T, b *mqttwstest.Broker) (*mqttws.Conn, chan protocol.Frame) {
	opener := protocol.NewOpener(testKey)
	frames := make(chan protocol.Frame, 16)
	conn, err := mqttws.Dial(context.Background(), mqttws.Options{
		URL:           func(context.Context) (string, error) { return b.URL(), nil },
		ClientID:      protocol.LaptopClientID(testSession),
		Subscriptions: []string{protocol.UpTopic(testSession)},
		OnMessage: func(m mqttws.Message) {
			if f, ok := opener.Open(m.Topic, m.Payload); ok {
				frames <- f
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return conn, frames
}

// A panic inside the relay never takes an invocation down: before acceptance the deployed code
// answers, after it the invocation fails and is never run again.
func TestAPanicInTheRelayKeepsThePromise(t *testing.T) {
	t.Run("before acceptance", func(t *testing.T) {
		h := newHarnessWith(t, harnessOptions{timing: fastTiming(), ping: func(*harness) (awsauth.Liveness, error) { panic("liveness exploded") }})
		newLaptop(t, h.broker)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: `{"x":1}`}
		resp, body := waitResponse(t, h.runtimeNext())
		if resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" || body != `{"x":1}` {
			t.Fatalf("runtime got %v %q", resp.Header, body)
		}
		if !strings.Contains(h.logs.joined(), "req-1 ran the deployed code: the relay failed unexpectedly (liveness exploded)") {
			t.Fatalf("logs %q", h.logs.joined())
		}
	})
	t.Run("after acceptance", func(t *testing.T) {
		h := newHarnessWith(t, harnessOptions{timing: fastTiming(), ping: func(h *harness) (awsauth.Liveness, error) {
			if h.pings.Load() > 1 {
				panic("liveness exploded")
			}
			return awsauth.Live, nil
		}})
		l := newLaptop(t, h.broker)
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
		runtime := h.runtimeNext()
		l.read(t)
		l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
		// The first silence check panics.
		p := h.api.next(t)
		if p.errorType != "Runtime.DevModeRelayFailed" || !strings.Contains(p.body, "liveness exploded") {
			t.Fatalf("%+v", p)
		}
		h.keptByTheRelay(t, runtime, "req-1", 2)
	})
}
