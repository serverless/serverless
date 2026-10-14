package bridge

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws/mqttwstest"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// closeHook replaces a connection's Close; close gets the real Close to call.
type closeHook struct {
	BrokerConn
	close func(real func() error) error
}

func (c *closeHook) Close() error { return c.close(c.BrokerConn.Close) }

// firstConnWith wraps the Close of the first connection the relay makes, the one that goes idle.
func firstConnWith(close func(real func() error) error) func(*harness, BrokerConn) BrokerConn {
	var made atomic.Int32
	return func(_ *harness, c BrokerConn) BrokerConn {
		if made.Add(1) != 1 {
			return c
		}
		return &closeHook{BrokerConn: c, close: close}
	}
}

// idleTiming makes the connection idle once the relay's clock has moved past the connect spacing
// too (connectGap plus its jitter), so the only wait before a replacement connect is the one the
// link chooses for the connection it replaces.
func idleTiming() Timing {
	timing := fastTiming()
	timing.IdleReconnect = connectGap + connectJitter
	return timing
}

// AWS IoT Core can refuse a CONNECT of a client id whose previous connection is still open
// (reason code 0x97): the idle connection is closed before its replacement connects. The idle
// connection's Close waits for the replacement's connect to begin, or 200 ms (well under
// staleCloseWait), so the recorded order is the one the link chose, on every run: a link that
// connects beside the close records the connect first.
func TestAnIdleConnectionIsClosedBeforeItsReplacementConnects(t *testing.T) {
	timing := idleTiming()
	var mu sync.Mutex
	var order []string
	note := func(event string) {
		mu.Lock()
		defer mu.Unlock()
		order = append(order, event)
	}
	replacement := make(chan struct{})
	var dials atomic.Int32
	h := newHarnessWith(t, harnessOptions{
		timing: timing,
		onDial: func() {
			if dials.Add(1) == 2 {
				note("connect")
				close(replacement)
			}
		},
		wrap: firstConnWith(func(real func() error) error {
			timer := time.NewTimer(200 * time.Millisecond)
			defer timer.Stop()
			select {
			case <-replacement:
			case <-timer.C:
			}
			err := real()
			note("close")
			return err
		}),
	})
	h.relayWithIdleBetween(t, newLaptop(t, h.broker), timing.IdleReconnect)
	waitFor(t, "the idle connection to close and its replacement to connect", func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(order) == 2
	})
	mu.Lock()
	defer mu.Unlock()
	if order[0] != "close" {
		t.Fatalf("events %v: the replacement connected while the idle connection was open", order)
	}
}

// A close stuck on a dead socket holds the replacement connect for staleCloseWait and no longer:
// the invocation is still relayed.
func TestAStuckCloseHoldsTheReplacementConnectOnlyBriefly(t *testing.T) {
	timing := idleTiming()
	release := make(chan struct{})
	var closeCalled atomic.Int64
	h := newHarnessWith(t, harnessOptions{timing: timing, wrap: firstConnWith(func(real func() error) error {
		closeCalled.CompareAndSwap(0, time.Now().UnixNano())
		<-release
		return real()
	})})
	// Registered after the harness, so it runs before the harness's cleanups: the relay's Close
	// waits for the stuck close.
	t.Cleanup(func() { close(release) })
	h.relayWithIdleBetween(t, newLaptop(t, h.broker), timing.IdleReconnect)
	if n := h.bridgeConnects(); n != 2 {
		t.Fatalf("the bridge connected %d times", n)
	}
	h.dialMu.Lock()
	replaced := h.dialTimes[1]
	h.dialMu.Unlock()
	held := replaced.Sub(time.Unix(0, closeCalled.Load()))
	// The bound is what matters; the slack above it covers a slow scheduler under -race.
	if held < staleCloseWait-50*time.Millisecond || held > staleCloseWait+time.Second {
		t.Fatalf("the replacement connect waited %v for the stuck close, want about %v", held, staleCloseWait)
	}
}

// restingConn is a connection the link no longer trusts; it counts its closes.
type restingConn struct {
	done   chan struct{}
	closes atomic.Int32
}

func (c *restingConn) Publish(context.Context, string, []byte, uint32) error { return nil }
func (c *restingConn) Done() <-chan struct{}                                 { return c.done }
func (c *restingConn) Close() error {
	c.closes.Add(1)
	return nil
}

// While connects rest after a failure that will not pass, an invocation that finds the connection
// idle closes it and runs the deployed code: no connect starts.
func TestWhileConnectsRestAnIdleConnectionIsClosedWithNoConnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	var dials atomic.Int32
	now := time.Now()
	stale := &restingConn{done: make(chan struct{})}
	l := &link{
		dial: func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
			dials.Add(1)
			return nil, errors.New("refused")
		},
		now:           func() time.Time { return now },
		idleAfter:     time.Second,
		logf:          func(string, ...any) {},
		ctx:           ctx,
		wg:            &wg,
		conn:          stale,
		lastUsed:      now.Add(-time.Minute),
		disabledUntil: now.Add(time.Minute),
	}
	if _, _, err := l.get(context.Background(), time.Second); !errors.Is(err, errNotConnected) {
		t.Fatalf("get returned %v, want errNotConnected", err)
	}
	wg.Wait()
	if n := stale.closes.Load(); n != 1 {
		t.Fatalf("the idle connection was closed %d times, want once", n)
	}
	if n := dials.Load(); n != 0 {
		t.Fatalf("a connect started %d times while connects rest", n)
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.conn != nil || l.dialing != nil {
		t.Fatal("the link kept the idle connection or started a connect")
	}
}

// A connect that panics is over: the invocation waiting for it stops waiting at once, invocations
// run the deployed code for a short pause (like after any failed connect), and then one connects
// again, instead of every later invocation waiting on a connect that never ends or dialling (and
// panicking) at once.
func TestAConnectThatPanicsPausesThenLetsAnInvocationConnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	defer func() {
		cancel()
		wg.Wait()
	}()
	var dials atomic.Int32
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	good := &restingConn{done: make(chan struct{})}
	l := &link{
		dial: func(context.Context, func(mqttws.Message), func(error)) (BrokerConn, error) {
			if dials.Add(1) == 1 {
				panic("unexpected")
			}
			return good, nil
		},
		now:       func() time.Time { return time.Unix(0, clock.Load()) },
		idleAfter: time.Minute,
		logf:      func(string, ...any) {},
		ctx:       ctx,
		wg:        &wg,
	}
	started := time.Now()
	if _, _, err := l.get(context.Background(), 5*time.Second); !errors.Is(err, errNotConnected) {
		t.Fatalf("get returned %v, want errNotConnected", err)
	}
	if waited := time.Since(started); waited > 2*time.Second {
		t.Fatalf("get waited %s for a connect that had ended", waited)
	}
	if _, _, err := l.get(context.Background(), 5*time.Second); !errors.Is(err, errNotConnected) {
		t.Fatalf("a get during the pause returned %v, want errNotConnected", err)
	}
	if n := dials.Load(); n != 1 {
		t.Fatalf("connects started %d times during the pause, want 1", n)
	}
	clock.Add(int64(firstBackoff + time.Millisecond))
	conn, _, err := l.get(context.Background(), 5*time.Second)
	if err != nil || conn != good {
		t.Fatalf("the get after the pause returned %v, %v; want the new connection", conn, err)
	}
	if n := dials.Load(); n != 2 {
		t.Fatalf("connects started %d times, want 2", n)
	}
}

// A connection that ends while no invocation uses it writes nothing to the function's log: the
// environment is idle, frozen, or thawed only to shut down, maybe after the function was deleted,
// and a line then creates its log group again. One that ends under an invocation is logged once:
// it explains why that invocation ran the deployed code, or failed. The MQTT client marks the
// connection done before it reports the loss, so the invocation may release it first: the line is
// written whichever of the two runs first. Either way the link forgets the connection.
func TestALostConnectionIsLoggedOnlyUnderAnInvocation(t *testing.T) {
	ended := errors.New("AWS IoT Core ended the connection (reason code 0x8D)")
	for _, c := range []struct {
		name string
		// steps run in order: "get" takes the connection for an invocation, "end" marks it done,
		// "release" ends the invocation, "lost" reports the loss.
		steps []string
		want  int
	}{
		{name: "idle", steps: []string{"end", "lost"}, want: 0},
		{name: "idle after an invocation", steps: []string{"get", "release", "end", "lost"}, want: 0},
		{name: "lost under an invocation", steps: []string{"get", "end", "lost", "release"}, want: 1},
		{name: "released before the loss is reported", steps: []string{"get", "end", "release", "lost"}, want: 1},
		// A publish that failed because the connection ended drops it (broken) before the
		// invocation hands off and releases it.
		{name: "dropped, then lost, then released", steps: []string{"get", "end", "broken", "lost", "release"}, want: 1},
		{name: "dropped and released before the loss is reported", steps: []string{"get", "end", "broken", "release", "lost"}, want: 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var wg sync.WaitGroup
			logs := &logSink{}
			now := time.Now()
			conn := &restingConn{done: make(chan struct{})}
			l := &link{
				now:       func() time.Time { return now },
				idleAfter: time.Minute,
				logf:      logs.logf,
				ctx:       ctx,
				wg:        &wg,
				conn:      conn,
				lastUsed:  now,
			}
			for _, step := range c.steps {
				switch step {
				case "get":
					got, _, err := l.get(context.Background(), time.Second)
					if err != nil || got != conn {
						t.Fatalf("get returned %v, %v; want the connection", got, err)
					}
				case "end":
					close(conn.done)
				case "release":
					l.release(conn)
				case "broken":
					l.broken(conn)
				case "lost":
					l.lost(&connRef{conn: conn}, ended)
				}
			}
			wg.Wait()
			if n := strings.Count(logs.joined(), "the connection to AWS IoT Core ended: "+ended.Error()); n != c.want {
				t.Fatalf("logged the end %d times, want %d: %q", n, c.want, logs.joined())
			}
			l.mu.Lock()
			defer l.mu.Unlock()
			if l.conn != nil {
				t.Fatal("the link kept the connection that ended")
			}
		})
	}
}

// The case seen in AWS: an attached environment outlives its session, idle, and AWS IoT Core
// ends its connection (keep-alive timeout) while the runtime waits for an invocation that never
// comes. The bridge writes nothing.
func TestAnIdleBridgeThatLosesItsConnectionWritesNothing(t *testing.T) {
	h := newHarness(t, fastTiming())
	connected := func() bool {
		h.relay.link.mu.Lock()
		defer h.relay.link.mu.Unlock()
		return h.relay.link.conn != nil
	}
	waitFor(t, "the bridge to connect", connected)
	h.runtimeNext()
	waitFor(t, "the runtime to wait for an invocation", func() bool { return h.api.nexts.Load() == 1 })
	h.broker.Drop(bridgeID)
	waitFor(t, "the bridge to notice its connection ended", func() bool { return !connected() })
	if logs := h.logs.joined(); strings.Contains(logs, "the connection to AWS IoT Core ended") {
		t.Fatalf("an idle bridge logged %q", logs)
	}
}

// A connect that ends while the runtime waits for its next invocation writes nothing to the
// function's log: Lambda freezes the environment then and thaws it only for the next invocation
// or to shut it down, maybe after the function was deleted. A connect that ends while the
// environment works (here before the runtime asks for an invocation, as during its init) is
// logged.
func TestAConnectEndingWhileTheRuntimeWaitsWritesNothing(t *testing.T) {
	for _, c := range []struct {
		name         string
		runtimeWaits bool
	}{
		{name: "the runtime waits", runtimeWaits: true},
		{name: "the environment works"},
	} {
		t.Run(c.name, func(t *testing.T) {
			release := make(chan struct{})
			h := newHarnessWith(t, harnessOptions{timing: fastTiming(), dial: func(ctx context.Context, _ func(mqttws.Message), _ func(error)) (BrokerConn, error) {
				select {
				case <-release:
				case <-ctx.Done():
				}
				return nil, errors.New("refused")
			}})
			if c.runtimeWaits {
				h.runtimeNext()
				waitFor(t, "the runtime to wait for an invocation", func() bool { return h.api.nexts.Load() == 1 })
			}
			close(release)
			waitFor(t, "the connect to end", func() bool {
				h.relay.link.mu.Lock()
				defer h.relay.link.mu.Unlock()
				return h.relay.link.dialing == nil && !h.relay.link.disabledUntil.IsZero()
			})
			logged := strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core: refused")
			if logged == c.runtimeWaits {
				t.Fatalf("logged %v, want %v: %q", logged, !c.runtimeWaits, h.logs.joined())
			}
		})
	}
}

// A connection that ends while an invocation waits for its acceptance, or after it, is logged
// with its cause exactly once, through the real MQTT client: it marks the connection done before
// it reports the loss, so the invocation can hand off and release the link first.
func TestAConnectionEndingUnderAnInvocationIsLoggedWithItsCause(t *testing.T) {
	const cause = "the connection to AWS IoT Core ended: "
	for _, accepted := range []bool{false, true} {
		name := "before acceptance"
		if accepted {
			name = "after acceptance"
		}
		t.Run(name, func(t *testing.T) {
			timing := fastTiming()
			timing.AcceptWindow = 20 * time.Second
			h := newHarness(t, timing)
			l := newLaptop(t, h.broker)
			h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(60 * time.Second), body: "{}"}
			runtime := h.runtimeNext()
			l.read(t)
			if accepted {
				l.send(t, protocol.Header{Kind: protocol.KindAccepted, ID: "req-1"}, nil)
				h.waitAccepted(t, "req-1")
			}
			h.broker.Drop(bridgeID)
			if accepted {
				if p := h.api.next(t); p.errorType != "Runtime.DevModeDisconnected" {
					t.Fatalf("posted %+v, want Runtime.DevModeDisconnected", p)
				}
			} else {
				waitResponse(t, runtime)
				if logs := h.logs.joined(); !strings.Contains(logs, "req-1 ran the deployed code: "+lostAcceptanceReason) {
					t.Fatalf("no pass line: %q", logs)
				}
			}
			waitFor(t, "the cause of the end to be logged", func() bool { return strings.Contains(h.logs.joined(), cause) })
			logs := h.logs.joined()
			if n := strings.Count(logs, cause); n != 1 {
				t.Fatalf("logged the end %d times, want once: %q", n, logs)
			}
			if strings.Contains(logs, cause+cause) {
				t.Fatalf("the line repeats its prefix: %q", logs)
			}
		})
	}
}

// A connection that ends while the invoke is being published is logged with its cause exactly
// once: the failed publish drops the connection (broken) before the invocation hands off, and
// the MQTT client may report the loss before or after either. Each connection's Close waits until
// the loss was reported, so the client's own report is never skipped for a close that came first
// (a case of the MQTT client, not the link); the order of the rest is left to the scheduler, so
// the scenario runs several times.
func TestAConnectionEndingDuringThePublishIsLoggedWithItsCause(t *testing.T) {
	const cause = "the connection to AWS IoT Core ended: "
	for range 20 {
		timing := fastTiming()
		timing.AcceptWindow = 20 * time.Second
		reported := make(chan struct{})
		var once sync.Once
		h := newHarnessWith(t, harnessOptions{
			timing: timing,
			wrap: func(_ *harness, c BrokerConn) BrokerConn {
				return &closeHook{BrokerConn: c, close: func(real func() error) error {
					select {
					case <-reported:
					case <-time.After(2 * time.Second):
					}
					return real()
				}}
			},
		})
		go func() {
			for !strings.Contains(h.logs.joined(), cause) {
				time.Sleep(time.Millisecond)
			}
			once.Do(func() { close(reported) })
		}()
		t.Cleanup(func() { once.Do(func() { close(reported) }) })
		newLaptop(t, h.broker)
		waitFor(t, "the bridge to connect", func() bool {
			h.relay.link.mu.Lock()
			defer h.relay.link.mu.Unlock()
			return h.relay.link.conn != nil
		})
		// No PUBACK comes: the publish of the invoke waits until the connection ends under it.
		h.broker.Set(func(b *mqttwstest.Broker) { b.Silent = true })
		h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(60 * time.Second), body: "{}"}
		runtime := h.runtimeNext()
		waitFor(t, "the invocation to be offered", func() bool {
			h.relay.mu.Lock()
			defer h.relay.mu.Unlock()
			return h.relay.pending["req-1"] != nil
		})
		h.broker.Drop(bridgeID)
		waitResponse(t, runtime)
		if logs := h.logs.joined(); !strings.Contains(logs, "req-1 ran the deployed code: "+lostAcceptanceReason) {
			t.Fatalf("no pass line: %q", logs)
		}
		waitFor(t, "the cause of the end to be logged", func() bool { return strings.Contains(h.logs.joined(), cause) })
		if n := strings.Count(h.logs.joined(), cause); n != 1 {
			t.Fatalf("logged the end %d times, want once: %q", n, h.logs.joined())
		}
		h.broker.Set(func(b *mqttwstest.Broker) { b.Silent = false })
	}
}

// A connect that outlives the invocation it was started for and fails while the runtime waits
// writes no line then, but the next invocation's pass reason carries its cause: a function that
// cannot reach AWS IoT Core (a VPC without a route, say) still says why it runs the deployed code.
func TestTheNextInvocationNamesWhyTheLastConnectFailed(t *testing.T) {
	release := make(chan struct{})
	timing := fastTiming()
	timing.ConnectWait = 200 * time.Millisecond
	const failure = "dial tcp: i/o timeout"
	h := newHarnessWith(t, harnessOptions{timing: timing, dial: func(ctx context.Context, _ func(mqttws.Message), _ func(error)) (BrokerConn, error) {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil, errors.New(failure)
	}})
	// Invocation 1 waits ConnectWait for the start connect, then runs the deployed code.
	h.api.queue <- fakeInvocation{id: "req-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	if resp, _ := waitResponse(t, h.runtimeNext()); resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "req-1" {
		t.Fatalf("the runtime got %v, want req-1", resp.Header)
	}
	// The runtime waits for its next invocation (the environment would be frozen) when the
	// connect fails.
	runtime := h.runtimeNext()
	waitFor(t, "the runtime to wait for an invocation", func() bool { return h.relay.waits.Load() == 1 })
	close(release)
	waitFor(t, "the connect to end", func() bool {
		h.relay.link.mu.Lock()
		defer h.relay.link.mu.Unlock()
		return h.relay.link.dialing == nil && !h.relay.link.disabledUntil.IsZero()
	})
	if logs := h.logs.joined(); strings.Contains(logs, "could not connect") {
		t.Fatalf("a connect ending while the runtime waits was logged: %q", logs)
	}
	// Invocation 2 arrives while connects rest.
	h.api.queue <- fakeInvocation{id: "req-2", deadline: deadlineIn(30 * time.Second), body: "{}"}
	waitResponse(t, runtime)
	want := "req-2 ran the deployed code: no connection to AWS IoT Core (the last connect failed: " + failure + ")"
	if logs := h.logs.joined(); !strings.Contains(logs, want) {
		t.Fatalf("logs %q, want %q", logs, want)
	}
}
