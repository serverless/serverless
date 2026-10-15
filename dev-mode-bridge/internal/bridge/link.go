package bridge

// Lock order. The MQTT client delivers every inbound message on its own goroutine through
// Relay.receive, and its Close waits for that goroutine: a Close called from there, or by anyone
// holding a lock receive needs, never returns. So:
//
//   - Relay.mu is the only lock of this package the message path takes (with the leaf locks of
//     protocol.Opener, uploadPool and livenessCache). Nothing holds Relay.mu while calling the
//     link, a BrokerConn, the Runtime API, S3, Direct Messaging or the logger.
//   - link.mu guards the connection state only. Nothing holds it while calling the Dialer or a
//     BrokerConn's Publish or Close, and the message path never takes it.
//   - BrokerConn.Close is never called from OnMessage or OnLost: connections are closed by the
//     invocation or Close that dropped them, or by a goroutine the relay waits for in Close.
//   - An invocation waits, holding no lock, for OnLost to report the end of the connection it
//     used (link.release, bounded by lossReportWait); OnLost never waits for an invocation.
//   - uploadPool.mu, livenessCache.mu and awayCount.mu are leaves: nothing is called while holding
//     them.
//
// Relay.mu and link.mu are never held together.

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws"
)

// BrokerConn is one connection to AWS IoT Core (mqttws.Conn in Lambda, a fake in tests).
type BrokerConn interface {
	Publish(ctx context.Context, topic string, payload []byte, expirySeconds uint32) error
	Done() <-chan struct{}
	Close() error
}

// Dialer connects and subscribes; onMessage receives every inbound message (it must not block),
// onLost is called once when the connection ends by itself.
type Dialer func(ctx context.Context, onMessage func(mqttws.Message), onLost func(error)) (BrokerConn, error)

var (
	// errNotConnected: no connection is available (yet); the invocation runs the deployed code.
	errNotConnected = errors.New("not connected to AWS IoT Core")
	errClosed       = errors.New("the relay has stopped")
)

const (
	// dialTimeout bounds one connect: the handshake, CONNECT and SUBSCRIBE, and AssumeRole.
	dialTimeout = 10 * time.Second
	// restFor: after a connect failure that will not pass, invocations stop waiting for a
	// connection for this long and run the deployed code at once.
	restFor = time.Minute
	// A failure that may pass with time is tried again after a backoff that starts at
	// firstBackoff and doubles up to maxBackoff: in the background during the retry window, and
	// after it by the first invocation once the backoff has passed, for as long as the environment
	// lives.
	firstBackoff = time.Second
	maxBackoff   = 15 * time.Second
	// AWS IoT Core accepts about one CONNECT per second per client id and refuses more with reason
	// code 0x97 (quota exceeded) or 0x96 (message rate too high). A connect therefore starts at
	// least connectGap after the previous one ended (its CONNECT is sent at its end, after
	// AssumeRole and the WebSocket handshake), plus up to connectJitter, and a connect refused with
	// either code is tried again quotaRetries times, each wait twice the last.
	connectGap    = time.Second
	connectJitter = 500 * time.Millisecond
	quotaRetries  = 2
	// staleCloseWait bounds how long a connect waits for the connection it replaces to close: AWS
	// IoT Core can refuse a CONNECT of a client id whose previous connection is still open (reason
	// code 0x97), and a close stuck on a dead socket must not hold the invocation that waits.
	staleCloseWait = 500 * time.Millisecond
	// lossReportWait bounds how long an invocation the bridge answered, whose connection ended,
	// waits before it hands off for the MQTT client to report the loss, so that its cause is logged
	// while the environment still works (see release). The client reports it on a goroutine of its own right
	// after it marks the connection done, and not at all after a Close that came first.
	lossReportWait = 500 * time.Millisecond
)

// refusedForQuota says whether err is a CONNECT refused for one of AWS IoT Core's rate quotas.
func refusedForQuota(err error) bool {
	var r mqttws.ReasonError
	return errors.As(err, &r) && r.Packet == "CONNECT" && (r.Code == 0x96 || r.Code == 0x97)
}

// refusedAuthorization says whether err is AWS IoT Core refusing to authorize the connection: a
// CONNECT refused "not authorized" (0x87), or a WebSocket upgrade answered 401 or 403. Right after
// the broker role is created, AWS can take minutes to apply its permissions, so this may pass
// within the retry window; after it, it is taken as lasting.
func refusedAuthorization(err error) bool {
	var r mqttws.ReasonError
	if errors.As(err, &r) {
		return r.Packet == "CONNECT" && r.Code == 0x87
	}
	var h mqttws.HandshakeError
	return errors.As(err, &h) && (h.Status == http.StatusUnauthorized || h.Status == http.StatusForbidden)
}

// link keeps this environment's one connection. It never trusts a connection: one that ended, one
// whose publish failed, and one idle since the last invocation for longer than idleAfter (a frozen
// environment's socket is half-open after about 100 s) is replaced before the next relay. A
// connection in use by an invocation is never replaced for idleness.
type link struct {
	dial      Dialer
	onMessage func(mqttws.Message)
	now       func() time.Time
	idleAfter time.Duration
	logf      Logf
	// retryFor is how long after start a refused AssumeRole is retried in the background (IAM
	// propagation after the broker was created); after that, invocations retry it (see
	// maxBackoff). retryable says which errors may pass with time.
	retryFor  time.Duration
	retryable func(error) bool
	ctx       context.Context // ends when the relay closes
	wg        *sync.WaitGroup // the relay's goroutines; Close waits for them

	mu       sync.Mutex
	closed   bool
	started  time.Time
	conn     BrokerConn
	epoch    int // counts connections: the environment is sent once per connection
	lastUsed time.Time
	active   int // invocations using conn
	// dialing is closed when the connect under way ends; retrying is closed once it has failed
	// and is waiting to try again, when invocations stop waiting for it.
	dialing       chan struct{}
	retrying      chan struct{}
	disabledUntil time.Time
	lastConnect   time.Time     // when the last connect ended
	backoff       time.Duration // the next wait after a failure that may pass; 0 after a connect
	// lastFailure is the cleaned cause of the last failed connect, until one succeeds. Its line is
	// not written while the runtime waits (see runtimeWaiter), so invocations that find no
	// connection name it in their own line instead.
	lastFailure string
	// endedUnder is a connection an invocation released after it had ended, until lost() logs that
	// end; endLogged is the last connection whose end was logged. The MQTT client marks a
	// connection done before it reports the loss, so either may run first: the end of a
	// connection an invocation used is logged once whichever does.
	endedUnder BrokerConn
	endLogged  BrokerConn
	// reported is closed, and replaced, each time lost() runs (see release).
	reported chan struct{}
}

// connectFailed is errNotConnected with the cause of the last failed connect.
type connectFailed struct {
	cause    string
	retrying bool
}

func (e connectFailed) Error() string {
	if e.retrying {
		return "the last connect failed: " + e.cause + "; still retrying"
	}
	return "the last connect failed: " + e.cause
}

func (e connectFailed) Unwrap() error { return errNotConnected }

// nextBackoff returns the wait after a failure that may pass with time, and doubles the next one
// up to maxBackoff.
func (l *link) nextBackoff() time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	wait := max(l.backoff, firstBackoff)
	l.backoff = min(wait*2, maxBackoff)
	return wait
}

// goLocked runs f on a goroutine the relay's Close waits for; l.mu must be held. After Close it
// runs nothing.
func (l *link) goLocked(f func()) {
	if l.closed {
		return
	}
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		defer func() {
			if p := recover(); p != nil {
				l.logf("the AWS IoT Core connection failed unexpectedly: %s", cleanText(p))
			}
		}()
		f()
	}()
}

func (l *link) usableLocked() bool {
	if l.conn == nil {
		return false
	}
	select {
	case <-l.conn.Done():
		return false
	default:
	}
	return l.active > 0 || l.now().Sub(l.lastUsed) <= l.idleAfter
}

// start begins connecting in the background (called once, right after the bridge is ready).
func (l *link) start() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.started = l.now()
	l.beginDialLocked(nil, false)
}

// beginDialLocked starts a connect unless one is under way, the link is closed, or connects rest
// (resting); l.mu must be held. stale is the connection being replaced, or nil: this is the one
// place it is closed, before the connect begins (closeStale), or on its own when no connect
// starts here.
func (l *link) beginDialLocked(stale BrokerConn, resting bool) {
	dial := l.dialing == nil && !l.closed && l.dial != nil && !resting
	if !dial && stale == nil {
		return
	}
	var done, retrying chan struct{}
	if dial {
		done, retrying = make(chan struct{}), make(chan struct{})
		l.dialing, l.retrying = done, retrying
	}
	l.goLocked(func() {
		// A connect that panics (goLocked logs it) is over too: invocations stop waiting for it,
		// run the deployed code for one backoff, as after a failure that may pass, and then one
		// connects again. ended is set once the connect has ended normally. Neither path holds l.mu
		// past its own critical section (endDial unlocks on a panic too), so this never waits on a
		// lock its own goroutine holds.
		ended := false
		if dial {
			defer func() {
				if ended {
					return
				}
				l.endDial(done, nil, l.nextBackoff(), errors.New("the connect panicked"))
				close(done)
			}()
		}
		l.closeStale(stale)
		if !dial {
			return
		}
		started := l.now()
		conn, rest, err := l.dialWithRetry(retrying)
		stray := l.endDial(done, conn, rest, err)
		ended = true
		close(done)
		if stray != nil {
			_ = stray.Close()
		} else if err == nil {
			l.logf("connected to AWS IoT Core in %d ms", l.now().Sub(started).Milliseconds())
		}
	})
}

// markConnect records when a connect attempt ended, and ties its OnLost callback to the
// connection it made; l.mu is released on every path, a panic included.
func (l *link) markConnect(ref *connRef, conn BrokerConn, err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lastConnect = l.now()
	if err == nil {
		ref.conn = conn
	}
}

// endDial records how the connect behind done ended: its connection, or rest before the next one
// (none when the relay closed). Returns a connection made after the relay closed, for the caller to
// close. It takes l.mu and releases it on every path, a panic included.
func (l *link) endDial(done chan struct{}, conn BrokerConn, rest time.Duration, err error) (stray BrokerConn) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.dialing == done {
		l.dialing, l.retrying = nil, nil
	}
	switch {
	case err == nil && l.closed:
		stray = conn
	case err == nil:
		l.conn = conn
		l.lastUsed = l.now()
		l.epoch++
		l.backoff = 0
		l.lastFailure = ""
	case !l.closed:
		l.disabledUntil = l.now().Add(rest)
	}
	return stray
}

// closeStale closes the connection a connect replaces (nothing when nil) and waits for that at
// most staleCloseWait. It runs on a goroutine the relay waits for, holding no lock (see the lock
// order).
func (l *link) closeStale(stale BrokerConn) {
	if stale == nil {
		return
	}
	closed := make(chan struct{})
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		defer close(closed)
		defer func() {
			if p := recover(); p != nil {
				l.logf("closing the previous AWS IoT Core connection failed unexpectedly: %s", cleanText(p))
			}
		}()
		_ = stale.Close()
	}()
	timer := time.NewTimer(staleCloseWait)
	defer timer.Stop()
	select {
	case <-closed:
	case <-timer.C:
	case <-l.ctx.Done():
	}
}

// dialWithRetry connects, retrying in the background while a failure may pass with time and the
// retry window lasts. On failure it also returns how long invocations then run the deployed code
// before one tries again: the backoff for a failure that may pass, restFor for any other.
func (l *link) dialWithRetry(retrying chan struct{}) (BrokerConn, time.Duration, error) {
	gap, refusals := connectGap, 0
	for {
		if !l.spaceConnect(gap) {
			return nil, 0, errClosed
		}
		ref := &connRef{}
		ctx, cancel := context.WithTimeout(l.ctx, dialTimeout)
		conn, err := l.dial(ctx, l.onMessage, func(err error) { l.lost(ref, err) })
		cancel()
		l.markConnect(ref, conn, err)
		if err == nil {
			return conn, 0, nil
		}
		if l.ctx.Err() != nil {
			return nil, 0, errClosed
		}
		if refusedForQuota(err) && refusals < quotaRetries {
			// Invocations keep waiting for this connect: it is likely to pass in a second or two.
			refusals++
			gap = connectGap << (refusals - 1)
			l.logf("%s; connecting again in %d s or a little more", clean(err), int(gap.Seconds()))
			continue
		}
		gap = connectGap
		inWindow := l.now().Sub(l.started) <= l.retryFor
		mayPass := l.retryable != nil && l.retryable(err)
		l.failed(err)
		if !mayPass && !(inWindow && refusedAuthorization(err)) {
			l.logf("could not connect to AWS IoT Core: %s; invocations run the deployed code", clean(err))
			return nil, restFor, err
		}
		delay := l.nextBackoff()
		if !inWindow {
			// Past the retry window: no more retries in the background, but the failure may still
			// pass (IAM can take longer to let a new broker role in), so a later invocation tries
			// again once the backoff has passed.
			l.logf("could not connect to AWS IoT Core: %s; invocations run the deployed code, and the first after %d s connects again", clean(err), int(delay.Seconds()))
			return nil, delay, err
		}
		l.logf("could not connect to AWS IoT Core yet: %s; trying again in %d s", clean(err), int(delay.Seconds()))
		select {
		case <-retrying:
		default:
			close(retrying)
		}
		timer := time.NewTimer(delay)
		select {
		case <-timer.C:
		case <-l.ctx.Done():
			timer.Stop()
			return nil, 0, errClosed
		}
	}
}

// failed records the cause of a failed connect (see lastFailure).
func (l *link) failed(err error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lastFailure = clean(err)
}

// notConnectedLocked is the error of a get that found no connection: errNotConnected, with the
// last connect's cause when one failed. l.mu must be held.
func (l *link) notConnectedLocked(retrying bool) error {
	switch {
	case l.lastFailure != "":
		return connectFailed{cause: l.lastFailure, retrying: retrying}
	case retrying:
		return fmt.Errorf("%w yet: still retrying", errNotConnected)
	}
	return errNotConnected
}

// spaceConnect waits until at least gap, plus a random part of connectJitter, has passed since
// the last connect ended (a connection that ended right after it was made, or a refused connect,
// is not followed by another within the same second). It returns false when the relay closed
// meanwhile.
func (l *link) spaceConnect(gap time.Duration) bool {
	l.mu.Lock()
	last := l.lastConnect
	l.mu.Unlock()
	if !last.IsZero() {
		if wait := last.Add(gap).Sub(l.now()); wait > 0 {
			timer := time.NewTimer(wait + rand.N(connectJitter))
			select {
			case <-timer.C:
			case <-l.ctx.Done():
				timer.Stop()
				return false
			}
		}
	}
	return true
}

// connRef ties an OnLost callback to the connection it was registered for, so a late report
// never drops a newer connection.
type connRef struct{ conn BrokerConn }

// lost runs on the MQTT client's goroutine: it only forgets the connection. Closing a connection
// that ended by itself is not needed, and is never done from here (see the lock order). The end is
// logged only when an invocation used the connection (see endedUnder), where it explains why that
// invocation ran the deployed code or failed. Otherwise the environment may be idle, or thawed only
// to shut down after the function was deleted, and a line would create its log group again.
func (l *link) lost(ref *connRef, err error) {
	l.mu.Lock()
	current := ref.conn != nil && l.conn == ref.conn
	if current {
		l.conn = nil
	}
	underInvocation := (current && l.active > 0) || (ref.conn != nil && l.endedUnder == ref.conn)
	logIt := underInvocation && !l.closed
	if underInvocation && l.endedUnder == ref.conn {
		l.endedUnder = nil
	}
	l.mu.Unlock()
	if logIt {
		l.logf("the connection to AWS IoT Core ended: %s", clean(err))
	}
	// Marked only once the line is written: an invocation waiting in release hands off after it,
	// and one released meanwhile (it set endedUnder again) is not remembered past it.
	l.mu.Lock()
	if underInvocation {
		l.endLogged = ref.conn
		if l.endedUnder == ref.conn {
			l.endedUnder = nil
		}
	}
	if l.reported != nil {
		close(l.reported)
		l.reported = nil
	}
	l.mu.Unlock()
}

// get returns a usable connection and its epoch, waiting at most `wait` for one to be made. A
// caller that got one calls release when its invocation ends.
func (l *link) get(ctx context.Context, wait time.Duration) (BrokerConn, int, error) {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return nil, 0, errClosed
	}
	if l.usableLocked() {
		l.active++
		conn, epoch := l.conn, l.epoch
		l.mu.Unlock()
		return conn, epoch, nil
	}
	// The connection is not usable: beginDialLocked closes it before its replacement connects.
	stale := l.conn
	l.conn = nil
	resting := l.dialing == nil && l.now().Before(l.disabledUntil)
	l.beginDialLocked(stale, resting)
	dialing, retrying := l.dialing, l.retrying
	if resting || dialing == nil {
		err := l.notConnectedLocked(false)
		l.mu.Unlock()
		return nil, 0, err
	}
	l.mu.Unlock()
	timer := time.NewTimer(wait)
	defer timer.Stop()
	stillRetrying, timedOut := false, false
	select {
	case <-dialing:
	case <-retrying:
		// AWS IAM is still letting the broker role in: invocations run the deployed code at once
		// instead of waiting for each retry.
		stillRetrying = true
	case <-timer.C:
		timedOut = true
	case <-ctx.Done():
		return nil, 0, ctx.Err()
	case <-l.ctx.Done():
		return nil, 0, errClosed
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	switch {
	case l.closed:
		return nil, 0, errClosed
	case stillRetrying || timedOut || !l.usableLocked():
		return nil, 0, l.notConnectedLocked(stillRetrying)
	}
	l.active++
	return l.conn, l.epoch, nil
}

// release marks the end of an invocation that got conn: idle time counts from here. A connection
// that already ended, and whose end lost() has not logged yet, is remembered for lost(). When the
// bridge answered the invocation itself, release also waits up to lossReportWait for that report:
// the runtime then asks for its next invocation at once, and nothing is logged while it waits (see
// runtimeWaiter), so the line that explains how this invocation ended would be lost. An invocation
// the deployed code answers needs no wait: the environment works until the runtime asks again.
func (l *link) release(conn BrokerConn, answered bool) {
	l.mu.Lock()
	l.active--
	l.lastUsed = l.now()
	if conn == nil || conn == l.endLogged || !ended(conn) {
		l.mu.Unlock()
		return
	}
	l.endedUnder = conn
	l.mu.Unlock()
	if !answered {
		return
	}
	timer := time.NewTimer(lossReportWait)
	defer timer.Stop()
	for {
		l.mu.Lock()
		if l.closed || l.endLogged == conn {
			l.mu.Unlock()
			return
		}
		if l.reported == nil {
			l.reported = make(chan struct{})
		}
		reported := l.reported
		l.mu.Unlock()
		select {
		case <-reported:
		case <-timer.C:
			return
		case <-l.ctx.Done():
			return
		}
	}
}

// broken drops a connection a publish failed on, so the next invocation dials anew. Only an
// invocation holding conn calls it, so a conn that already ended is remembered for lost(), as by
// release: once dropped, it is no longer the current connection lost() would match.
func (l *link) broken(conn BrokerConn) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if conn != nil && conn != l.endLogged && ended(conn) {
		l.endedUnder = conn
	}
	if l.conn == conn && conn != nil {
		l.conn = nil
		l.goLocked(func() { _ = conn.Close() })
	}
}

// close stops connecting and closes the connection; the caller waits for the goroutines.
func (l *link) close() {
	l.mu.Lock()
	l.closed = true
	conn := l.conn
	l.conn = nil
	l.mu.Unlock()
	if conn != nil {
		_ = conn.Close()
	}
}
