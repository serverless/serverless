package mqttws

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws/mqttwstest"
)

type inbox struct {
	mu  sync.Mutex
	got []Message
	ch  chan Message
}

func newInbox() *inbox { return &inbox{ch: make(chan Message, 64)} }

func (i *inbox) add(m Message) {
	i.mu.Lock()
	i.got = append(i.got, m)
	i.mu.Unlock()
	i.ch <- m
}

func (i *inbox) next(t *testing.T) Message {
	t.Helper()
	select {
	case m := <-i.ch:
		return m
	case <-time.After(5 * time.Second):
		t.Fatal("no message within 5 s")
		return Message{}
	}
}

// none checks that nothing arrives for a short while (a negative check: it can only wait).
func (i *inbox) none(t *testing.T) {
	t.Helper()
	select {
	case m := <-i.ch:
		t.Fatalf("unexpected message on %s", m.Topic)
	case <-time.After(300 * time.Millisecond):
	}
}

func dial(t *testing.T, b *mqttwstest.Broker, id string, subs []string, onMessage func(Message), onLost func(error)) (*Conn, error) {
	t.Helper()
	return dialWith(b, Options{ClientID: id, Subscriptions: subs, OnMessage: onMessage, OnLost: onLost})
}

func dialWith(b *mqttwstest.Broker, o Options) (*Conn, error) {
	o.URL = func(context.Context) (string, error) { return b.URL(), nil }
	if o.PacketTimeout == 0 {
		o.PacketTimeout = 2 * time.Second
	}
	return Dial(context.Background(), o)
}

// noLeaks fails the test when goroutines it started still run after it ended: the stdlib form of
// a goleak check (it waits up to 5 s for them to exit, then prints every stack).
func noLeaks(t *testing.T) {
	t.Helper()
	before := runtime.NumGoroutine()
	t.Cleanup(func() { settles(t, before) })
}

func settles(t *testing.T, want int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		n := runtime.NumGoroutine()
		if n <= want {
			return
		}
		if time.Now().After(deadline) {
			buf := make([]byte, 1<<20)
			t.Errorf("%d goroutines still run, %d expected:\n%s", n, want, buf[:runtime.Stack(buf, true)])
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitLost(t *testing.T, lost <-chan error) error {
	t.Helper()
	select {
	case err := <-lost:
		return err
	case <-time.After(5 * time.Second):
		t.Fatal("loss not reported within 5 s")
		return nil
	}
}

func TestPublishAndReceiveThroughTheBroker(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	in := newInbox()
	sub, err := dial(t, b, "sls-dev-s_1-e1", []string{"sls-dev/s_1/down/e1"}, in.add, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer sub.Close()
	pub, err := dial(t, b, "sls-dev-s_1-cli", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer pub.Close()
	big := bytes.Repeat([]byte{1}, 129024)
	if err := pub.Publish(context.Background(), "sls-dev/s_1/down/e1", big, 3); err != nil {
		t.Fatal(err)
	}
	got := in.next(t)
	if got.Topic != "sls-dev/s_1/down/e1" || !bytes.Equal(got.Payload, big) {
		t.Fatalf("got %s with %d bytes", got.Topic, len(got.Payload))
	}
	published := b.Published()
	if len(published) != 1 || published[0].Expiry == nil || *published[0].Expiry != 3 {
		t.Fatalf("expiry not sent: %+v", published)
	}
	if published[0].QoS != 1 || published[0].Retain || published[0].ClientID != "sls-dev-s_1-cli" {
		t.Fatalf("want QoS 1, not retained, from the publisher: %+v", published[0])
	}
	// No expiry asked, none sent.
	if err := pub.Publish(context.Background(), "sls-dev/s_1/down/e1", []byte("x"), 0); err != nil {
		t.Fatal(err)
	}
	in.next(t)
	if p := b.Published(); len(p) != 2 || p[1].Expiry != nil {
		t.Fatalf("an expiry was sent: %+v", p[1].Expiry)
	}
}

func TestRefusalsAreReasonErrors(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	b.Set(func(b *mqttwstest.Broker) { b.SubackCode["sls-dev/s_1/gone"] = 0x87 })
	_, err := dial(t, b, "c1", []string{"sls-dev/s_1/down/e1", "sls-dev/s_1/gone"}, nil, nil)
	if !NotAuthorized(err) {
		t.Fatalf("SUBACK 0x87: %v", err)
	}
	if want := (ReasonError{Packet: "SUBSCRIBE", Code: 0x87}); !errors.Is(err, want) {
		t.Fatalf("want %v, got %v", want, err)
	}
	b.Set(func(b *mqttwstest.Broker) { b.SubackCode = map[string]byte{}; b.PubackCode["sls-dev/other/up"] = 0x87 })
	c, err := dial(t, b, "c2", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	err = c.Publish(context.Background(), "sls-dev/other/up", []byte("x"), 0)
	if !NotAuthorized(err) || !errors.Is(err, ReasonError{Packet: "PUBLISH", Code: 0x87}) {
		t.Fatalf("PUBACK 0x87: %v", err)
	}
	// The connection survives a refused QoS 1 publish.
	if err := c.Publish(context.Background(), "sls-dev/s_1/up", []byte("x"), 0); err != nil {
		t.Fatalf("after a refusal: %v", err)
	}
	b.Set(func(b *mqttwstest.Broker) { b.ConnackCode = 0x87 })
	_, err = dial(t, b, "c3", nil, nil, nil)
	if !NotAuthorized(err) || !errors.Is(err, ReasonError{Packet: "CONNECT", Code: 0x87}) {
		t.Fatalf("CONNACK 0x87: %v", err)
	}
	b.Set(func(b *mqttwstest.Broker) { b.ConnackCode = 0x86 })
	if _, err = dial(t, b, "c4", nil, nil, nil); NotAuthorized(err) || !errors.Is(err, ReasonError{Packet: "CONNECT", Code: 0x86}) {
		t.Fatalf("CONNACK 0x86: %v", err)
	}
	if got := strings.Join(b.Connects(), ","); got != "c1,c2,c3,c4" {
		t.Fatalf("connects: %s", got)
	}
}

func TestADroppedConnectionIsReportedOnceAndPublishFails(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	lost := make(chan error, 4)
	c, err := dial(t, b, "c1", nil, nil, func(err error) { lost <- err })
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	b.Drop("c1")
	if err := waitLost(t, lost); err == nil {
		t.Fatal("a loss without a reason")
	}
	select {
	case <-c.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("Done not closed after the loss")
	}
	if err := c.Publish(context.Background(), "t", []byte("x"), 0); err == nil {
		t.Fatal("publish on a dropped connection succeeded")
	}
	select {
	case err := <-lost:
		t.Fatalf("reported twice: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestAPublishThatIsNeverAcknowledgedTimesOut(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	c, err := dial(t, b, "c1", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	b.Set(func(b *mqttwstest.Broker) { b.Silent = true })
	start := time.Now()
	err = c.Publish(context.Background(), "t", []byte("x"), 0)
	if err == nil {
		t.Fatal("no error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want a deadline, got %v", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatalf("took %v", time.Since(start))
	}
}

func TestCloseDoesNotReportALoss(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	lost := make(chan error, 1)
	c, err := dial(t, b, "c1", nil, nil, func(err error) { lost <- err })
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() { _ = c.Close() })
	}
	wg.Wait()
	c.Close()
	select {
	case <-c.Done():
	default:
		t.Fatal("Done is open after Close")
	}
	if err := c.Publish(context.Background(), "t", []byte("x"), 0); err == nil {
		t.Fatal("publish after Close succeeded")
	}
	select {
	case err := <-lost:
		t.Fatalf("Close reported a loss: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestNoGoroutineOutlivesClose(t *testing.T) {
	b := mqttwstest.New()
	defer b.Close()
	before := runtime.NumGoroutine()
	in := newInbox()
	c, err := dial(t, b, "c1", []string{"sls-dev/s_1/#"}, in.add, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Publish(context.Background(), "sls-dev/s_1/up", []byte("x"), 3); err != nil {
		t.Fatal(err)
	}
	in.next(t)
	c.Close()
	// The broker stays up: its side of the connection ends with the DISCONNECT, and so must every
	// goroutine the client started.
	settles(t, before)
}

func TestCloseFromOnLostReturns(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	var conn atomic.Pointer[Conn]
	closed := make(chan struct{})
	c, err := dial(t, b, "c1", nil, nil, func(error) {
		conn.Load().Close()
		close(closed)
	})
	if err != nil {
		t.Fatal(err)
	}
	conn.Store(c)
	b.Drop("c1")
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("Close called from OnLost did not return")
	}
}

// TestALossDuringDialIsDialsError drops the connection while Dial may still be subscribing:
// either Dial fails and OnLost is never called (the caller never had the connection), or Dial
// succeeds and the loss is reported exactly once.
func TestALossDuringDialIsDialsError(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	subs := make([]string, 50)
	for i := range subs {
		subs[i] = fmt.Sprintf("sls-dev/s_1/down/e%d", i)
	}
	failed := 0
	for i := range 30 {
		id := fmt.Sprintf("c%d", i)
		lost := make(chan error, 4)
		go func() {
			for !b.Connected(id) {
				runtime.Gosched()
			}
			b.Drop(id)
		}()
		c, err := dial(t, b, id, subs, nil, func(err error) { lost <- err })
		if err != nil {
			failed++
			select {
			case lostErr := <-lost:
				t.Fatalf("OnLost (%v) for a Dial that failed (%v)", lostErr, err)
			case <-time.After(50 * time.Millisecond):
			}
			continue
		}
		waitLost(t, lost)
		noSecondLoss(t, lost)
		c.Close()
	}
	t.Logf("%d of 30 dials failed", failed)
}

func TestASecondConnectionWithTheClientIDTakesOver(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	lost := make(chan error, 2)
	first, err := dial(t, b, "sls-dev-s_1-e1", nil, nil, func(err error) { lost <- err })
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := dial(t, b, "sls-dev-s_1-e1", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	err = waitLost(t, lost)
	var reason ReasonError
	if !errors.As(err, &reason) || reason.Code != 0x8E || reason.Packet != "DISCONNECT" {
		t.Fatalf("want DISCONNECT 0x8E, got %v", err)
	}
	if !b.Connected("sls-dev-s_1-e1") {
		t.Fatal("the second connection is not connected")
	}
	if err := second.Publish(context.Background(), "t", []byte("x"), 0); err != nil {
		t.Fatal(err)
	}
}

func TestDuplicateHeldAndFilteredDeliveries(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	in := newInbox()
	c, err := dial(t, b, "c1", []string{"sls-dev/s_1/#", "sls-dev/other"}, in.add, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	b.Set(func(b *mqttwstest.Broker) { b.Duplicate = true })
	if err := c.Publish(context.Background(), "sls-dev/s_1/up", []byte("twice"), 3); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if m := in.next(t); string(m.Payload) != "twice" {
			t.Fatalf("got %q", m.Payload)
		}
	}
	in.none(t)

	b.Set(func(b *mqttwstest.Broker) { b.Duplicate = false; b.Hold = true })
	if err := c.Publish(context.Background(), "sls-dev/s_1/up", []byte("held"), 3); err != nil {
		t.Fatal(err)
	}
	in.none(t)
	if p := b.Published(); len(p) != 2 || string(p[1].Payload) != "held" {
		t.Fatalf("a held publish is still recorded: %+v", p)
	}

	b.Set(func(b *mqttwstest.Broker) { b.Hold = false })
	for _, topic := range []string{"sls-dev/s_2/up", "sls-dev/other/x", "sls-dev/s_10/up"} {
		b.Send(topic, []byte("no"))
	}
	for _, topic := range []string{"sls-dev/s_1", "sls-dev/s_1/down/e1", "sls-dev/other"} {
		b.Send(topic, []byte(topic))
		if m := in.next(t); m.Topic != topic || string(m.Payload) != topic {
			t.Fatalf("sent to %s, got %s", topic, m.Topic)
		}
	}
	in.none(t)
}

func TestKeepAliveNoticesASilentBroker(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	lost := make(chan error, 4)
	c, err := dialWith(b, Options{ClientID: "c1", KeepAlive: 1, OnLost: func(err error) { lost <- err }})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	b.Set(func(b *mqttwstest.Broker) { b.Silent = true })
	if err := waitLost(t, lost); err == nil {
		t.Fatal("a loss without a reason")
	}
	// paho reports both the missing PINGRESP and the read that then fails; OnLost hears one.
	noSecondLoss(t, lost)
}

func noSecondLoss(t *testing.T, lost <-chan error) {
	t.Helper()
	select {
	case err := <-lost:
		t.Fatalf("reported twice: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestAStuckSocketFailsPublishesAndCloseInTime(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	c, err := dialWith(b, Options{ClientID: "c1", PacketTimeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	// The broker stops reading: 150 messages of 126 KiB (19 MB) outgrow the socket buffers, so
	// writes block until the write deadline ends the connection.
	b.Set(func(b *mqttwstest.Broker) { b.Silent = true })
	payload := bytes.Repeat([]byte{2}, 129024)
	start := time.Now()
	var wg sync.WaitGroup
	var failed atomic.Int32
	for range 150 {
		wg.Go(func() {
			if c.Publish(context.Background(), "t", payload, 3) != nil {
				failed.Add(1)
			}
		})
	}
	wg.Wait()
	took := time.Since(start)
	if failed.Load() != 150 {
		t.Fatalf("%d of 150 publishes failed", failed.Load())
	}
	if took > 3*time.Second {
		t.Fatalf("publishes took %v with a 1 s packet timeout", took)
	}
	start = time.Now()
	c.Close()
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("Close took %v", took)
	}
}

func TestAPacketLargerThanAWSAcceptsEndsTheConnection(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	lost := make(chan error, 1)
	c, err := dial(t, b, "c1", nil, nil, func(err error) { lost <- err })
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	start := time.Now()
	if err := c.Publish(context.Background(), "t", make([]byte, mqttwstest.MaximumPacketSize), 0); err == nil {
		t.Fatal("an oversized publish succeeded")
	}
	// It fails when the connection ends, not when the 2 s packet timeout runs out.
	if took := time.Since(start); took > time.Second {
		t.Fatalf("the publish failed after %v", took)
	}
	var reason ReasonError
	if err := waitLost(t, lost); !errors.As(err, &reason) || reason.Code != 0x95 {
		t.Fatalf("want DISCONNECT 0x95, got %v", err)
	}
}

func TestTheReadLimitBoundsInboundMessages(t *testing.T) {
	noLeaks(t)
	b := mqttwstest.New()
	defer b.Close()
	in := newInbox()
	lost := make(chan error, 1)
	c, err := dial(t, b, "c1", []string{"t"}, in.add, func(err error) { lost <- err })
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	// The largest packet AWS IoT Core sends arrives whole.
	largest := make([]byte, mqttwstest.MaximumPacketSize-16)
	b.Send("t", largest)
	if m := in.next(t); len(m.Payload) != len(largest) {
		t.Fatalf("got %d bytes", len(m.Payload))
	}
	// A WebSocket message above ReadLimit ends the connection instead of being read.
	b.Send("t", make([]byte, ReadLimit))
	waitLost(t, lost)
	in.none(t)
}

func TestDialFailsFastWhenTheURLCannotBeSigned(t *testing.T) {
	_, err := Dial(context.Background(), Options{URL: func(context.Context) (string, error) { return "", errors.New("no credentials") }})
	if err == nil || err.Error() != "no credentials" {
		t.Fatalf("%v", err)
	}
}

// signedQuery looks like what awsauth.PresignIoT appends: credentials in the query.
const (
	testAccessKey = "AKIAIOSFODNN7EXAMPLE"
	testSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	testToken     = "IQoJb3JpZ2luX2VjEXAMPLETOKENzZXNzaW9uLXRva2Vu"
	signedQuery   = "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=" + testAccessKey + "%2F20261002%2Fus-east-1%2Fiotdevicegateway%2Faws4_request" +
		"&X-Amz-Date=20261002T120000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=" + testSignature +
		"&X-Amz-Security-Token=" + testToken
)

func assertNoSecrets(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("no error")
	}
	for _, secret := range []string{"X-Amz-", "x-amz-", testAccessKey, testSignature, testToken, "mqtt?"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("the error carries %q: %v", secret, err)
		}
	}
}

// A WebSocket upgrade answered with another status than 101 is a HandshakeError carrying it, with
// the same text as before.
func TestARefusedHandshakeIsAHandshakeError(t *testing.T) {
	b := mqttwstest.New()
	defer b.Close()
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusServiceUnavailable} {
		b.Set(func(b *mqttwstest.Broker) { b.HandshakeStatus = status })
		_, err := dial(t, b, "c1", nil, nil, nil)
		var h HandshakeError
		if !errors.As(err, &h) || h.Status != status {
			t.Fatalf("status %d: %v", status, err)
		}
		if want := fmt.Sprintf("connecting to AWS IoT Core: failed to WebSocket dial: expected handshake response status code 101 but got %d", status); err.Error() != want {
			t.Fatalf("text %q", err.Error())
		}
	}
}

// A WebSocket upgrade answered with a server error or a throttle may pass with time: the error
// carries the status, and awsauth.Retryable says so. A refused authorization and a bad request do
// not.
func TestAHandshakeAnsweredWithAServerErrorOrAThrottleMayPass(t *testing.T) {
	b := mqttwstest.New()
	defer b.Close()
	for status, want := range map[int]bool{
		http.StatusInternalServerError: true,
		http.StatusBadGateway:          true,
		http.StatusServiceUnavailable:  true,
		http.StatusTooManyRequests:     true,
		http.StatusUnauthorized:        false,
		http.StatusForbidden:           false,
		http.StatusBadRequest:          false,
	} {
		b.Set(func(b *mqttwstest.Broker) { b.HandshakeStatus = status })
		_, err := dial(t, b, "c1", nil, nil, nil)
		var h HandshakeError
		if !errors.As(err, &h) || h.HTTPStatusCode() != status {
			t.Fatalf("status %d: %v", status, err)
		}
		if got := awsauth.Retryable(err); got != want {
			t.Errorf("status %d: Retryable = %v, want %v", status, got, want)
		}
	}
}

func TestDialErrorsNeverCarryTheSignedURL(t *testing.T) {
	refused := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// AWS IoT Core answers a bad signature with 403; this one also echoes the URL.
		http.Error(w, "Forbidden: "+r.URL.String(), http.StatusForbidden)
	}))
	defer refused.Close()
	closedPort := httptest.NewServer(http.NotFoundHandler())
	closedPort.Close()
	for name, target := range map[string]string{
		"refused handshake": "ws" + strings.TrimPrefix(refused.URL, "http") + "/mqtt?" + signedQuery,
		"closed port":       "wss" + strings.TrimPrefix(closedPort.URL, "http") + "/mqtt?" + signedQuery,
		"unparsable URL":    "wss://iot endpoint.example/mqtt?" + signedQuery,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := Dial(context.Background(), Options{
				URL:           func(context.Context) (string, error) { return target, nil },
				ClientID:      "c1",
				PacketTimeout: 2 * time.Second,
			})
			assertNoSecrets(t, err)
			if name == "refused handshake" && !strings.Contains(err.Error(), "403") {
				t.Fatalf("the status is missing: %v", err)
			}
		})
	}
}

// TestTheDefaultDialHonoursTheProxyVariables runs a child test process with HTTPS_PROXY pointing
// at a recording proxy (net/http reads the proxy variables once per process).
func TestTheDefaultDialHonoursTheProxyVariables(t *testing.T) {
	if os.Getenv("SLS_DEV_MQTTWS_PROXY_CHILD") == "1" {
		_, err := Dial(context.Background(), Options{
			URL:           func(context.Context) (string, error) { return "wss://iot.example.invalid/mqtt?" + signedQuery, nil },
			ClientID:      "c1",
			PacketTimeout: 5 * time.Second,
		})
		assertNoSecrets(t, err)
		return
	}
	var mu sync.Mutex
	var seen []string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.Method+" "+r.Host)
		mu.Unlock()
		http.Error(w, "no", http.StatusForbidden)
	}))
	defer proxy.Close()
	run := func(noProxy string) {
		t.Helper()
		cmd := exec.Command(os.Args[0], "-test.run=^TestTheDefaultDialHonoursTheProxyVariables$", "-test.count=1")
		cmd.Env = append(os.Environ(), "SLS_DEV_MQTTWS_PROXY_CHILD=1",
			"HTTPS_PROXY="+proxy.URL, "https_proxy="+proxy.URL, "NO_PROXY="+noProxy, "no_proxy="+noProxy)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("child (NO_PROXY=%q): %v\n%s", noProxy, err, out)
		}
	}
	run("")
	mu.Lock()
	got := fmt.Sprint(seen)
	mu.Unlock()
	if got != "[CONNECT iot.example.invalid:443]" {
		t.Fatalf("the proxy saw %s", got)
	}
	run("example.invalid")
	mu.Lock()
	defer mu.Unlock()
	if len(seen) != 1 {
		t.Fatalf("NO_PROXY was ignored: the proxy saw %v", seen)
	}
}
