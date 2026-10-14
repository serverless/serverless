package bridge

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
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

type reportBody struct {
	Since  int64 `json:"since"`
	Counts []struct {
		Fn     string `json:"fn"`
		Reason string `json:"reason"`
		N      int    `json:"n"`
	} `json:"counts"`
}

// readReport checks that f is this environment's count report and returns its body.
func readReport(t *testing.T, f protocol.Frame) reportBody {
	t.Helper()
	if f.Header.Kind != protocol.KindPassed || f.Header.Env != testEnv {
		t.Fatalf("frame %+v, want a count report", f.Header)
	}
	var b reportBody
	if err := json.Unmarshal(f.Body, &b); err != nil {
		t.Fatalf("body %q: %v", f.Body, err)
	}
	return b
}

// passThrough queues one invocation and waits until the runtime got it to run itself.
func (h *harness) passThrough(t *testing.T, id string) {
	t.Helper()
	h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(30 * time.Second), body: "{}"}
	resp, _ := waitResponse(t, h.runtimeNext())
	if got := resp.Header.Get("Lambda-Runtime-Aws-Request-Id"); got != id {
		t.Fatalf("the runtime got %q, want %q", got, id)
	}
}

// relayOne relays one invocation the laptop answers, and returns the frames that came with its
// invoke, in order (the invoke first).
func (h *harness) relayOne(t *testing.T, l *laptop, id string, extra int) []protocol.Frame {
	t.Helper()
	h.api.queue <- fakeInvocation{id: id, deadline: deadlineIn(time.Minute), body: "{}"}
	frames := []protocol.Frame{l.read(t)}
	if frames[0].Header.Kind != protocol.KindInvoke || frames[0].Header.ID != id {
		t.Fatalf("frame %+v, want the invoke of %s", frames[0].Header, id)
	}
	for i := 0; i < extra; i++ {
		frames = append(frames, l.read(t))
	}
	l.send(t, protocol.Header{Kind: protocol.KindResponse, ID: id}, []byte("1"))
	if p := h.api.next(t); !strings.HasSuffix(p.path, "/"+id+"/response") {
		t.Fatalf("posted %+v", p)
	}
	return frames
}

func TestTheAwayCountStartsAtItsFirstPassAndIsTakenWhole(t *testing.T) {
	var c awayCount
	first := time.UnixMilli(1_000)
	c.add(first)
	c.add(time.UnixMilli(2_000))
	if since, n := c.take(); !since.Equal(first) || n != 2 {
		t.Fatalf("took %v %d", since, n)
	}
	if _, n := c.take(); n != 0 {
		t.Fatalf("a second take found %d", n)
	}
	// A count put back keeps the earliest start.
	c.add(time.UnixMilli(5_000))
	c.putBack(first, 2)
	if since, n := c.take(); !since.Equal(first) || n != 3 {
		t.Fatalf("took %v %d after putting back", since, n)
	}
	c.putBack(first, 0)
	if _, n := c.take(); n != 0 {
		t.Fatalf("an empty put back counted %d", n)
	}
}

func TestTheReportBodyIsTheOneInTheSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("../protocol/testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Vectors []struct {
			Name            string `json:"name"`
			PlaintextBase64 string `json:"plaintextBase64"`
		} `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	for _, v := range file.Vectors {
		if v.Name != "passed counts" {
			continue
		}
		plaintext, _ := base64.StdEncoding.DecodeString(v.PlaintextBase64)
		body, err := passedReport(time.UnixMilli(1_790_000_000_000), "svc-dev-api", 3)
		if err != nil {
			t.Fatal(err)
		}
		want, err := protocol.EncodeFrame(protocol.Header{Kind: protocol.KindPassed, Env: testEnv}, body)
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(plaintext, want) {
			t.Fatalf("vector %q, bridge %q", plaintext, want)
		}
		return
	}
	t.Fatal("no passed counts vector")
}

// While Direct Messaging says the session is gone, invocations run the deployed code and are
// counted; the first offer once it is back carries the count, and only that one.
func TestInvocationsPassedWhileTheSessionWasGoneAreReportedOnce(t *testing.T) {
	h := newHarness(t, fastTiming())
	l := newLaptop(t, h.broker)
	start := time.Now().UnixMilli()
	h.live.Store(int32(awsauth.Gone))
	h.passThrough(t, "away-1")
	h.passThrough(t, "away-2")
	if n := h.bridgePublished(); n != 0 {
		t.Fatalf("the bridge published %d messages while the session was gone", n)
	}
	h.live.Store(int32(awsauth.Live))
	h.relay.live.set(awsauth.Live)
	h.runtimeNext()
	frames := h.relayOne(t, l, "req-1", 1)
	report := readReport(t, frames[1])
	if len(report.Counts) != 1 || report.Counts[0].Fn != "svc-dev-api" || report.Counts[0].Reason != "offline" || report.Counts[0].N != 2 || report.Since < start {
		t.Fatalf("report %+v (test started at %d)", report, start)
	}
	h.relayOne(t, l, "req-2", 0)
	if n := h.bridgePublished(); n != 3 {
		t.Fatalf("the bridge published %d messages, want two invokes and one report", n)
	}
	if !strings.Contains(h.logs.joined(), "told the Dev Mode session that 2 invocations ran the deployed code while it could not be reached") {
		t.Fatalf("logs %q", h.logs.joined())
	}
}

// Without a connection to AWS IoT Core invocations run the deployed code and are counted; the
// first offer on the connection made later carries the count.
func TestInvocationsPassedWithoutAConnectionAreReportedOnceConnected(t *testing.T) {
	var allow atomic.Bool
	var broker *mqttwstest.Broker
	h := newHarnessWith(t, harnessOptions{
		timing:    fastTiming(),
		retryable: func(error) bool { return true },
		broker:    func(b *mqttwstest.Broker) { broker = b },
		dial:      deniedUntilAllowed(&allow, &broker),
	})
	waitFor(t, "the first connect to fail", func() bool { return strings.Contains(h.logs.joined(), "could not connect to AWS IoT Core: ") })
	h.passThrough(t, "away-1")
	if !strings.Contains(h.logs.joined(), "away-1 ran the deployed code: no connection to AWS IoT Core") {
		t.Fatalf("logs %q", h.logs.joined())
	}
	allow.Store(true)
	h.skew.Store(int64(20 * time.Second))
	l := newLaptop(t, broker)
	h.runtimeNext()
	frames := h.relayOne(t, l, "req-1", 1)
	if report := readReport(t, frames[1]); len(report.Counts) != 1 || report.Counts[0].N != 1 {
		t.Fatalf("report %+v", report)
	}
}

// An invocation that was offered may still reach the developer's machine, which counts it itself
// (late): the bridge never counts it again.
func TestAnOfferedInvocationThatWasNotAcceptedIsNotCounted(t *testing.T) {
	var state atomic.Int32
	state.Store(int32(awsauth.Unknown))
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), ping: func(*harness) (awsauth.Liveness, error) {
		return awsauth.Liveness(state.Load()), nil
	}})
	l := newLaptop(t, h.broker)
	h.api.queue <- fakeInvocation{id: "away-1", deadline: deadlineIn(30 * time.Second), body: "{}"}
	runtime := h.runtimeNext()
	l.read(t) // the invoke reached the machine, which never answers it
	if resp, _ := waitResponse(t, runtime); resp.Header.Get("Lambda-Runtime-Aws-Request-Id") != "away-1" {
		t.Fatalf("runtime got %v", resp.Header)
	}
	state.Store(int32(awsauth.Live))
	h.relay.live.set(awsauth.Live)
	h.runtimeNext()
	h.relayOne(t, l, "req-1", 0)
	if n := h.bridgePublished(); n != 2 {
		t.Fatalf("the bridge published %d messages, want two invokes and no report", n)
	}
}

// A report AWS IoT Core refused was never delivered: the next offer carries it.
func TestARefusedReportIsSentWithTheNextOffer(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), wrap: func(h *harness, c BrokerConn) BrokerConn {
		// Publish 1 is req-1's invoke, publish 2 its report.
		return &hookedConn{BrokerConn: c, hookAt: 2, publish: func(context.Context, string, []byte, uint32, func() error) error {
			return mqttws.ReasonError{Packet: "PUBLISH", Code: 0x97}
		}}
	}})
	l := newLaptop(t, h.broker)
	h.live.Store(int32(awsauth.Gone))
	h.passThrough(t, "away-1")
	h.passThrough(t, "away-2")
	h.live.Store(int32(awsauth.Live))
	h.relay.live.set(awsauth.Live)
	h.runtimeNext()
	h.relayOne(t, l, "req-1", 0)
	frames := h.relayOne(t, l, "req-2", 1)
	if report := readReport(t, frames[1]); report.Counts[0].N != 2 {
		t.Fatalf("report %+v", report)
	}
}

// A report whose publish failed after it may have been delivered is not sent again: the session
// must never count an invocation twice.
func TestAReportThatMayHaveArrivedIsNotSentAgain(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), wrap: func(h *harness, c BrokerConn) BrokerConn {
		return &hookedConn{BrokerConn: c, hookAt: 2, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
			_ = real()
			return errors.New("the PUBACK did not come in time")
		}}
	}})
	l := newLaptop(t, h.broker)
	h.live.Store(int32(awsauth.Gone))
	h.passThrough(t, "away-1")
	h.live.Store(int32(awsauth.Live))
	h.relay.live.set(awsauth.Live)
	h.runtimeNext()
	frames := h.relayOne(t, l, "req-1", 1)
	readReport(t, frames[1])
	h.relayOne(t, l, "req-2", 0)
	if n := h.bridgePublished(); n != 3 {
		t.Fatalf("the bridge published %d messages, want two invokes and one report", n)
	}
	if !strings.Contains(h.logs.joined(), "could not tell the Dev Mode session about 1 invocation that ran the deployed code while it could not be reached") {
		t.Fatalf("logs %q", h.logs.joined())
	}
}

// A report publish that failed without a refusal leaves the connection in doubt, as an offer's
// does: it serves its invocation to the end, and the next invocation connects again.
func TestAReportThatFailedReplacesTheConnectionAfterItsInvocation(t *testing.T) {
	h := newHarnessWith(t, harnessOptions{timing: fastTiming(), wrap: func(h *harness, c BrokerConn) BrokerConn {
		return &hookedConn{BrokerConn: c, hookAt: 2, publish: func(ctx context.Context, topic string, payload []byte, expiry uint32, real func() error) error {
			<-ctx.Done()
			return ctx.Err()
		}}
	}})
	l := newLaptop(t, h.broker)
	h.live.Store(int32(awsauth.Gone))
	h.passThrough(t, "away-1")
	h.live.Store(int32(awsauth.Live))
	h.relay.live.set(awsauth.Live)
	h.runtimeNext()
	h.relayOne(t, l, "req-1", 0)
	h.relayOne(t, l, "req-2", 0)
	if n := h.bridgeConnects(); n != 2 {
		t.Fatalf("the bridge connected %d times, want once more after the failed report", n)
	}
}

// relayedNow is an invocation the relay starts handling now.
func relayedNow(id string) *relayed {
	return &relayed{inv: Invocation{RequestID: id, DeadlineMs: time.Now().Add(time.Minute).UnixMilli()}, start: time.Now()}
}

// A pass is counted only when the session could not be reached: not when the bridge is stopping,
// and not when the runtime's own request for the invocation ended.
func TestAPassIsNotCountedWhenTheRelayStoppedOrTheRequestEnded(t *testing.T) {
	stopped := newHarness(t, fastTiming())
	stopped.relay.Close()
	if stopped.relay.handle(context.Background(), relayedNow("req-closed")) {
		t.Fatal("a stopped relay relayed an invocation")
	}
	if _, n := stopped.relay.away.take(); n != 0 {
		t.Fatalf("a pass after the relay stopped was counted %d times", n)
	}

	connecting := newHarnessWith(t, harnessOptions{timing: fastTiming(), dial: func(ctx context.Context, _ func(mqttws.Message), _ func(error)) (BrokerConn, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}})
	ended, cancel := context.WithCancel(context.Background())
	cancel()
	if connecting.relay.handle(ended, relayedNow("req-ended")) {
		t.Fatal("an invocation whose request ended was relayed")
	}
	if _, n := connecting.relay.away.take(); n != 0 {
		t.Fatalf("a pass whose request ended was counted %d times", n)
	}
}

// countingConn counts its publishes and accepts each.
type countingConn struct{ publishes atomic.Int32 }

func (c *countingConn) Publish(context.Context, string, []byte, uint32) error {
	c.publishes.Add(1)
	return nil
}
func (c *countingConn) Done() <-chan struct{} { return nil }
func (c *countingConn) Close() error          { return nil }

// A report that is never published keeps its count for the next offer: one whose acceptance window
// has already passed, and one that could not be sealed.
func TestAReportThatIsNotPublishedKeepsItsCount(t *testing.T) {
	first := time.UnixMilli(1_000)
	for _, tc := range []struct {
		name  string
		key   []byte
		until time.Time
	}{
		{"its window passed", testKey, time.Now().Add(-time.Second)},
		{"sealing it failed", []byte("not a key"), time.Now().Add(time.Minute)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := NewRelay(RelayDeps{Session: Session{ID: testSession, Key: tc.key, FunctionName: "svc-dev-api", Environment: testEnv}})
			defer r.Close()
			r.away.add(first)
			conn := &countingConn{}
			if r.reportAway(conn, tc.until, 1) {
				t.Fatal("a report that was not published marked the connection")
			}
			if n := conn.publishes.Load(); n != 0 {
				t.Fatalf("published %d times", n)
			}
			if since, n := r.away.take(); !since.Equal(first) || n != 1 {
				t.Fatalf("kept %v %d, want the count of 1 from its first pass", since, n)
			}
		})
	}
}

// Passes counted, reports taken and counts put back at once lose nothing.
func TestTheAwayCountLosesNothingUnderConcurrentUse(t *testing.T) {
	var c awayCount
	const workers, each = 8, 200
	var wg sync.WaitGroup
	var reported atomic.Int64
	for w := 0; w < workers; w++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for i := 0; i < each; i++ {
				c.add(time.UnixMilli(int64(1_000 + i)))
			}
		}()
		go func() {
			defer wg.Done()
			for i := 0; i < each; i++ {
				since, n := c.take()
				if i%2 == 0 {
					c.putBack(since, n)
				} else {
					reported.Add(int64(n))
				}
			}
		}()
	}
	wg.Wait()
	_, left := c.take()
	if total := reported.Load() + int64(left); total != workers*each {
		t.Fatalf("counted %d passes, want %d", total, workers*each)
	}
}
