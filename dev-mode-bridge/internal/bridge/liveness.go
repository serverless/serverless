package bridge

import (
	"context"
	"sync"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
)

// livenessCache keeps the last Direct Messaging answer: liveness is a cached signal, not a call
// per invocation (each call counts against the CLI connection's message budget).
type livenessCache struct {
	ping       func(ctx context.Context) (awsauth.Liveness, error)
	now        func() time.Time
	liveFor    time.Duration
	notLiveFor time.Duration
	logf       Logf

	mu    sync.Mutex
	state awsauth.Liveness
	until time.Time
}

func (c *livenessCache) check(ctx context.Context) awsauth.Liveness {
	c.mu.Lock()
	if c.now().Before(c.until) {
		state := c.state
		c.mu.Unlock()
		return state
	}
	c.mu.Unlock()
	return c.ask(ctx, 2*time.Second)
}

// ask asks Direct Messaging now and caches the answer.
func (c *livenessCache) ask(ctx context.Context, timeout time.Duration) awsauth.Liveness {
	if c.ping == nil {
		return awsauth.Unknown
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	state, err := c.ping(ctx)
	if err != nil {
		c.logf("could not ask AWS IoT Core whether the Dev Mode session is live (%s); it counts as live", clean(err))
	}
	c.set(state)
	return state
}

func (c *livenessCache) set(state awsauth.Liveness) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state = state
	if state == awsauth.Live {
		c.until = c.now().Add(c.liveFor)
	} else {
		c.until = c.now().Add(c.notLiveFor)
	}
}

// invalidate makes the next check ask again.
func (c *livenessCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.until = time.Time{}
}
