package bridge

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/mqttws"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// Timing is every wait in the relay; Defaults() is what runs in Lambda.
type Timing struct {
	// ConnectWait bounds how long an invocation waits for the AWS IoT Core connection.
	ConnectWait time.Duration
	// IdleReconnect: a connection idle since the last invocation for longer is replaced first.
	IdleReconnect time.Duration
	// AcceptWindow bounds how long the bridge waits for the developer's machine to accept.
	AcceptWindow time.Duration
	// MinRemaining: an invocation with less time left runs the deployed code.
	MinRemaining time.Duration
	// MinAcceptWindow is the shortest acceptance window worth offering; with less, the
	// invocation runs the deployed code without being offered.
	MinAcceptWindow time.Duration
	// LiveFor and NotLiveFor are how long a liveness answer is reused.
	LiveFor    time.Duration
	NotLiveFor time.Duration
	// SilenceCheck: after this long without a frame for an accepted invocation, ask whether the
	// session is still there (Direct Messaging); never fail on silence alone.
	SilenceCheck time.Duration
	// UploadWait bounds the wait for a presigned upload URL.
	UploadWait time.Duration
	// AssumeRoleRetry: how long after the bridge starts a refused AssumeRole is retried.
	AssumeRoleRetry time.Duration
}

// Defaults are the timings in Lambda.
func Defaults() Timing {
	return Timing{
		ConnectWait:     3 * time.Second,
		IdleReconnect:   25 * time.Second,
		AcceptWindow:    3 * time.Second,
		MinRemaining:    time.Second,
		MinAcceptWindow: 500 * time.Millisecond,
		LiveFor:         10 * time.Second,
		NotLiveFor:      5 * time.Second,
		SilenceCheck:    5 * time.Second,
		UploadWait:      2 * time.Second,
		AssumeRoleRetry: 240 * time.Second,
	}
}

// Session is what the relay knows about the Dev Mode session it serves.
type Session struct {
	ID           string
	Key          []byte
	Owner        string
	FunctionName string
	Environment  string // this execution environment's id
}

// RelayDeps are the relay's collaborators.
type RelayDeps struct {
	Session   Session
	Dial      Dialer
	Retryable func(error) bool
	// Ping asks AWS IoT Core whether the session's CLI is connected. Only Gone means gone: an
	// unacknowledged, denied or failed question counts as live.
	Ping func(ctx context.Context) (awsauth.Liveness, error)
	// HTTP is used for S3; Upstream for the Runtime API (no proxy).
	HTTP        *http.Client
	Upstream    Upstream
	Now         func() time.Time
	Logf        Logf
	Environment func() map[string]string
	Timing      Timing
}

// MaxInvocation is Lambda's longest timeout: an invocation without a usable deadline is waited for
// no longer than this.
const MaxInvocation = 15 * time.Minute

const (
	// The frames waiting for one invocation are bounded; past the bound its result fails.
	maxQueuedFrames = 1024
	maxQueuedBytes  = 16 << 20
	// rememberOutcomes is how many finished invocations the bridge remembers, to tell a late
	// acceptance from one for an invocation the machine answered.
	rememberOutcomes = 1024
	// goneRecheck: after a gone frame that Direct Messaging did not confirm, ask again this soon
	// (a CLI that said goodbye can still look connected for about a second); gone frames that
	// arrive faster than this ask once.
	goneRecheck = time.Second
)

// The lines the live tests count. Each marks an invocation the deployed code ran while the
// developer's machine ran it too, or may have (the double run accepted as a residual). Each
// invocation gets at most one of them; keep their wording stable.
//
//   - lateAcceptanceLine: "<id> was accepted after it had already run the deployed code; the
//     answer from the developer's machine is ignored". The machine's acceptance (or reply) reached
//     the bridge after the acceptance window had closed: it ran on both.
//   - Every line that ends in mayAlsoHaveRunIt: "<id> ran the deployed code: <why>; the
//     developer's machine may also have run it". The invoke may have reached the machine, and an
//     acceptance can no longer reach the bridge, so the bridge cannot know whether it ran on both:
//   - lostAcceptanceReason: the connection ended while the bridge waited, or a publish of the
//     invoke failed because the connection ended (only its PUBACK may have been lost);
//   - "its publish was not acknowledged and no acceptance arrived within <N> ms (<error>)": a
//     publish of the invoke (the first, or the one sent again with the environment) timed out
//     without a PUBACK, so it may have been delivered; the window ended, and the bridge drops
//     that connection, so a later acceptance is never seen;
//   - "the relay has stopped (...)": Close, after such a publish.
//
// A definite refusal (the broker answered a publish of the invoke with a reason code at or above
// 0x80: nothing was delivered) is logged "<id> ran the deployed code: publishing it was refused
// (...)" and is not counted; nor is an answer from the machine that it did not run it.
const mayAlsoHaveRunIt = "the developer's machine may also have run it"

const (
	lateAcceptanceLine   = "%s was accepted after it had already run the deployed code; the answer from the developer's machine is ignored"
	lostAcceptanceReason = "the connection to AWS IoT Core ended before its acceptance could arrive; " + mayAlsoHaveRunIt
)

const tooLargeMessage = "Response payload size exceeded maximum allowed payload size (6291556 bytes)."

type outcome int

const (
	outcomeDeployed outcome = iota + 1 // the deployed code answered
	outcomeMachine                     // the developer's machine took it
)

type outcomeRecord struct {
	outcome outcome
	logged  bool // a late acceptance was logged
}

// pendingInv is an invocation offered to the developer's machine: its frames queue here. Its
// fields are guarded by Relay.mu.
type pendingInv struct {
	id       string
	queue    []protocol.Frame
	bytes    int
	signal   chan struct{} // gets a value when frames are queued
	overflow bool          // frames were dropped: the result cannot be carried
	// accepted is set the moment an acceptance (or a reply, which implies one) is queued. From
	// then on the invocation can no longer be withdrawn: the machine may be running it.
	accepted bool
}

// takes says whether a frame of this kind means the developer's machine took the invocation.
func takes(kind string) bool {
	switch kind {
	case protocol.KindAccepted, protocol.KindResponse, protocol.KindError, protocol.KindInitError,
		protocol.KindStreamStart, protocol.KindStreamData, protocol.KindStreamEnd:
		return true
	}
	return false
}

// Relay sends invocations to the developer's machine and posts their results.
type Relay struct {
	d       RelayDeps
	ctx     context.Context // ends at Close
	cancel  context.CancelFunc
	wg      sync.WaitGroup // every goroutine of the relay, and every Handle under way
	link    *link
	live    *livenessCache
	sealer  *protocol.Sealer
	opener  *protocol.Opener
	s3      s3Client
	uploads *uploadPool
	opened  atomic.Int64 // frames opened so far
	away    awayCount    // invocations passed while the session could not be reached
	// waits counts the runtime's requests for its next invocation that the Runtime API holds:
	// while one waits, the environment is idle (see runtimeWaiter) and the link logs nothing.
	waits atomic.Int32

	mu        sync.Mutex
	closed    bool
	pending   map[string]*pendingInv
	outcomes  map[string]*outcomeRecord
	order     []string // outcomes, oldest first
	gone      chan struct{}
	envSentAt int // the connection epoch the environment was last sent on
}

// NewRelay builds the relay; Start connects.
func NewRelay(d RelayDeps) *Relay {
	if d.Now == nil {
		d.Now = time.Now
	}
	if d.Logf == nil {
		d.Logf = func(string, ...any) {}
	}
	if d.HTTP == nil {
		d.HTTP = http.DefaultClient
	}
	ctx, cancel := context.WithCancel(context.Background())
	r := &Relay{
		d:         d,
		ctx:       ctx,
		cancel:    cancel,
		sealer:    protocol.NewSealer(d.Session.Key),
		opener:    protocol.NewOpener(d.Session.Key),
		s3:        s3Client{http: d.HTTP, key: d.Session.Key},
		uploads:   &uploadPool{now: d.Now},
		pending:   map[string]*pendingInv{},
		outcomes:  map[string]*outcomeRecord{},
		gone:      make(chan struct{}),
		envSentAt: -1,
	}
	r.live = &livenessCache{ping: d.Ping, now: d.Now, liveFor: d.Timing.LiveFor, notLiveFor: d.Timing.NotLiveFor, logf: d.Logf}
	r.link = &link{
		dial:      d.Dial,
		onMessage: r.receive,
		now:       d.Now,
		idleAfter: d.Timing.IdleReconnect,
		logf: func(format string, args ...any) {
			if r.waits.Load() == 0 {
				d.Logf(format, args...)
			}
		},
		retryFor:  d.Timing.AssumeRoleRetry,
		retryable: d.Retryable,
		ctx:       ctx,
		wg:        &r.wg,
	}
	return r
}

// Start connects in the background; it never blocks the runtime's init.
func (r *Relay) Start() {
	if r != nil {
		r.link.start()
	}
}

// Close disconnects and returns once nothing the relay started still runs: an invocation it was
// waiting for ends (the deployed code answers one not yet accepted; one accepted fails with
// Runtime.DevModeRelayFailed). It is safe to call more than once.
func (r *Relay) Close() {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.closed = true
	r.mu.Unlock()
	r.cancel()
	r.link.close()
	r.wg.Wait()
}

// runtimeWaiting implements runtimeWaiter.
func (r *Relay) runtimeWaiting(waiting bool) {
	switch {
	case r == nil:
	case waiting:
		r.waits.Add(1)
	default:
		r.waits.Add(-1)
	}
}

func (r *Relay) up() string   { return protocol.UpTopic(r.d.Session.ID) }
func (r *Relay) down() string { return protocol.DownTopic(r.d.Session.ID, r.d.Session.Environment) }

// clean is an error's text without any URL, SigV4 parameter or credential: presigned S3 and AWS
// IoT Core URLs carry credentials, and a *url.Error quotes its URL.
func clean(err error) string {
	if err == nil {
		return ""
	}
	return awsauth.Redact(err).Error()
}

// cleanText is clean for a recovered panic value.
func cleanText(v any) string { return clean(errors.New(fmt.Sprint(v))) }

// receive runs on the MQTT client's goroutine: it must never block, and takes no lock but r.mu
// and leaf locks (see the lock order in link.go).
func (r *Relay) receive(m mqttws.Message) {
	defer func() {
		if p := recover(); p != nil {
			r.d.Logf("dropped a message from AWS IoT Core: %s", cleanText(p))
		}
	}()
	frame, ok := r.opener.Open(m.Topic, m.Payload)
	if !ok {
		return
	}
	r.opened.Add(1)
	h := frame.Header
	switch m.Topic {
	case protocol.GoneTopic(r.d.Session.ID):
		// A gone frame is a hint, never proof: it may be a copy of an earlier goodbye. It wakes
		// the accepted invocations to ask Direct Messaging, and makes the next invocation ask
		// instead of trusting the cached answer.
		if h.Kind == protocol.KindGone {
			r.mu.Lock()
			close(r.gone)
			r.gone = make(chan struct{})
			r.mu.Unlock()
			r.live.invalidate()
		}
		return
	case r.down():
	default:
		return
	}
	var spare *protocol.Upload
	late := false
	r.mu.Lock()
	p := r.pending[h.ID]
	if h.Upload != nil && (p == nil || h.Kind != protocol.KindUploadURL) {
		// A spare upload URL riding along with a reply, or one that came after its request
		// stopped waiting: kept for the next large event.
		spare = h.Upload
	}
	switch {
	case p != nil && h.ID != "":
		r.queueLocked(p, frame)
	case takes(h.Kind):
		if rec := r.outcomes[h.ID]; rec != nil && rec.outcome == outcomeDeployed && !rec.logged {
			rec.logged = true
			late = true
		}
	}
	r.mu.Unlock()
	if spare != nil {
		r.uploads.put(*spare)
	}
	if late {
		// The residual double run: the machine ran an invocation the deployed code also ran.
		r.d.Logf(lateAcceptanceLine, h.ID)
	}
}

// queueLocked adds a frame to an invocation's queue; r.mu must be held.
func (r *Relay) queueLocked(p *pendingInv, f protocol.Frame) {
	if p.overflow {
		return
	}
	if len(p.queue) >= maxQueuedFrames || p.bytes+len(f.Body) > maxQueuedBytes {
		p.overflow = true
	} else {
		p.queue = append(p.queue, f)
		p.bytes += len(f.Body)
		if takes(f.Header.Kind) {
			p.accepted = true
		}
	}
	select {
	case p.signal <- struct{}{}:
	default:
	}
}

// enter counts a Handle under way, unless the relay has closed.
func (r *Relay) enter() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return false
	}
	r.wg.Add(1)
	return true
}

func (r *Relay) register(id string) (*pendingInv, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || r.pending[id] != nil {
		return nil, false
	}
	p := &pendingInv{id: id, signal: make(chan struct{}, 1)}
	r.pending[id] = p
	return p, true
}

// take empties an invocation's queue.
func (r *Relay) take(p *pendingInv) ([]protocol.Frame, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	frames := p.queue
	p.queue, p.bytes = nil, 0
	return frames, p.overflow
}

// withdraw closes the acceptance window: it is the one moment that decides. It fails (false)
// when an acceptance or a reply reached the bridge first, however close: the machine may be
// running the invocation, so the deployed code must not. Otherwise the invocation is the
// deployed code's from here, and an acceptance arriving later is logged as late.
func (r *Relay) withdraw(p *pendingInv) bool { return r.withdrawCounting(p, false) }

// withdrawCounting is withdraw; counted says the hand-off is logged with a counted line, so a
// late acceptance arriving anyway is not counted a second time.
func (r *Relay) withdrawCounting(p *pendingInv, counted bool) bool {
	r.mu.Lock()
	if p.accepted {
		r.mu.Unlock()
		return false
	}
	spares := r.endLocked(p, outcomeDeployed)
	if rec := r.outcomes[p.id]; rec != nil {
		rec.logged = counted
	}
	r.mu.Unlock()
	r.pool(spares)
	return true
}

// finish ends an invocation whatever was queued (see withdraw for the window).
func (r *Relay) finish(p *pendingInv, o outcome) {
	r.mu.Lock()
	spares := r.endLocked(p, o)
	r.mu.Unlock()
	r.pool(spares)
}

// endLocked removes p and remembers its outcome; it returns the upload URLs it was sent but did
// not use. r.mu must be held.
func (r *Relay) endLocked(p *pendingInv, o outcome) []protocol.Upload {
	id := p.id
	if r.pending[id] != p {
		return nil
	}
	delete(r.pending, id)
	var spares []protocol.Upload
	for _, f := range p.queue {
		if f.Header.Kind == protocol.KindUploadURL && f.Header.Upload != nil {
			spares = append(spares, *f.Header.Upload)
		}
	}
	p.queue, p.bytes = nil, 0
	if _, seen := r.outcomes[id]; !seen {
		r.order = append(r.order, id)
		if len(r.order) > rememberOutcomes {
			delete(r.outcomes, r.order[0])
			r.order = r.order[1:]
		}
	}
	r.outcomes[id] = &outcomeRecord{outcome: o}
	return spares
}

func (r *Relay) pool(spares []protocol.Upload) {
	for _, u := range spares {
		r.uploads.put(u)
	}
}

func (r *Relay) goneSignal() <-chan struct{} {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.gone
}

func (r *Relay) environment() map[string]string {
	if r.d.Environment == nil {
		return nil
	}
	return r.d.Environment()
}

func lowerHeaders(h http.Header) map[string]string {
	out := map[string]string{}
	for name, values := range h {
		if len(values) > 0 {
			out[strings.ToLower(name)] = values[0]
		}
	}
	return out
}

// relayed is one invocation under way.
type relayed struct {
	inv      Invocation
	start    time.Time
	p        *pendingInv
	conn     BrokerConn
	accepted bool
	stream   *streamPost
	// suspect: a publish of the invoke on conn failed without a refusal; it may still have been
	// delivered, so the connection serves this invocation to the end and is replaced after it.
	// suspectErr is that publish's error.
	suspect    bool
	suspectErr error
	// replace: a publish of the count report on conn failed without a refusal; the connection
	// serves this invocation to the end and is replaced after it, as for suspect.
	replace bool
}

func (r *Relay) logPass(id, reason string) bool {
	r.d.Logf("%s ran the deployed code: %s", id, reason)
	return false
}

// Handle relays one invocation. It returns false (the deployed code answers) whenever nothing ran
// on the developer's machine: no connection, the session gone, no acceptance in time. After the
// machine accepted, it always answers itself, with an error if the machine went away.
func (r *Relay) Handle(ctx context.Context, inv Invocation) (handled bool) {
	if r == nil {
		return false
	}
	if !r.enter() {
		return r.logPass(inv.RequestID, "the relay has stopped")
	}
	defer r.wg.Done()
	st := &relayed{inv: inv, start: r.d.Now()}
	defer func() {
		if p := recover(); p != nil {
			handled = r.recovered(st, p)
		}
	}()
	return r.handle(ctx, st)
}

// recovered keeps the promise after a panic: before acceptance the deployed code answers, after
// it the invocation fails with Runtime.DevModeRelayFailed.
func (r *Relay) recovered(st *relayed, v any) bool {
	reason := "the relay failed unexpectedly (" + cleanText(v) + ")"
	if st.p != nil && (st.accepted || !r.withdraw(st.p)) {
		st.accepted = true
		return r.relayFailed(st, reason)
	}
	return r.logPass(st.inv.RequestID, reason)
}

func refused(err error) bool {
	var reason mqttws.ReasonError
	return errors.As(err, &reason)
}

func ended(conn BrokerConn) bool {
	select {
	case <-conn.Done():
		return true
	default:
		return false
	}
}
