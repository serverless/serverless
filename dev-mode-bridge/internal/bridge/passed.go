package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// passedReason is the reason a report gives: the session could not be reached.
const passedReason = "offline"

// awayCount counts the invocations this execution environment handed to the deployed code because
// the Dev Mode session could not be reached: no connection to AWS IoT Core, or Direct Messaging
// saying the session's CLI is not connected. An invocation that was offered is never counted: the
// developer's machine may still get it, and then says so itself. mu is a leaf lock.
type awayCount struct {
	mu    sync.Mutex
	since time.Time
	n     int
}

func (c *awayCount) add(at time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.n == 0 {
		c.since = at
	}
	c.n++
}

// take returns the count and when it began, and starts again from zero.
func (c *awayCount) take() (time.Time, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	since, n := c.since, c.n
	c.since, c.n = time.Time{}, 0
	return since, n
}

// putBack returns a count that was never delivered, so the next report carries it.
func (c *awayCount) putBack(since time.Time, n int) {
	if n <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.n == 0 || since.Before(c.since) {
		c.since = since
	}
	c.n += n
}

type passedCount struct {
	Fn     string `json:"fn"`
	Reason string `json:"reason"`
	N      int    `json:"n"`
}

type passedBody struct {
	Since  int64         `json:"since"`
	Counts []passedCount `json:"counts"`
}

// passedReport is the body of a passed frame: one function's count since a time.
func passedReport(since time.Time, fn string, n int) ([]byte, error) {
	return json.Marshal(passedBody{Since: since.UnixMilli(), Counts: []passedCount{{Fn: fn, Reason: passedReason, N: n}}})
}

func invocationsWord(n int) string {
	if n == 1 {
		return "1 invocation"
	}
	return fmt.Sprintf("%d invocations", n)
}

// reportAway tells the session, on a connection that has just carried an offer, how many
// invocations ran the deployed code while it could not be reached. It is published after the
// offer, so the offer is never delayed; it gives up by `until` (the offer's acceptance window). A
// report AWS IoT Core refused was not delivered and is kept for the next offer; one that may have
// been delivered is dropped, so the session never counts an invocation twice. It returns true
// when the publish failed without a refusal: like an offer's, the connection is then replaced
// after the invocation.
func (r *Relay) reportAway(conn BrokerConn, until time.Time, expiry uint32) bool {
	since, n := r.away.take()
	if n == 0 {
		return false
	}
	if !r.d.Now().Before(until) {
		r.away.putBack(since, n)
		return false
	}
	body, err := passedReport(since, r.d.Session.FunctionName, n)
	var payload []byte
	if err == nil {
		payload, err = r.sealer.Seal(r.up(), protocol.Header{Kind: protocol.KindPassed, Env: r.d.Session.Environment}, body)
	}
	if err != nil {
		r.away.putBack(since, n)
		return false
	}
	ctx, cancel := context.WithDeadline(r.ctx, until)
	err = conn.Publish(ctx, r.up(), payload, expiry)
	cancel()
	switch {
	case err == nil:
		r.d.Logf("told the Dev Mode session that %s ran the deployed code while it could not be reached", invocationsWord(n))
	case refused(err):
		r.away.putBack(since, n)
	default:
		r.d.Logf("could not tell the Dev Mode session about %s that ran the deployed code while it could not be reached (%s)", invocationsWord(n), clean(err))
		return true
	}
	return false
}
