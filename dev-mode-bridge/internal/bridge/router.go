package bridge

import (
	"context"
	"net/http"
	"strconv"
	"strings"
)

// Invocation is one /runtime/invocation/next response: every Lambda-Runtime-* header and the event.
type Invocation struct {
	RequestID string
	// DeadlineMs is Lambda's deadline in epoch milliseconds; 0 when the header was missing or
	// malformed, which callers treat as unknown, never as "already passed".
	DeadlineMs int64
	Headers    http.Header
	Body       []byte
}

// Relayer decides who answers an invocation. Handle returns true when it answered the invocation
// itself (posted its result to the Runtime API); false hands the invocation to the runtime the
// wrapper started, so the deployed code answers. Handle must return false whenever nothing ran on
// the developer's machine, and must never panic out (the caller recovers to false anyway).
type Relayer interface {
	Handle(ctx context.Context, inv Invocation) bool
}

func invocationFrom(h http.Header, body []byte) Invocation {
	deadline, err := strconv.ParseInt(h.Get("Lambda-Runtime-Deadline-Ms"), 10, 64)
	if err != nil || deadline < 0 {
		deadline = 0
	}
	runtime := http.Header{}
	for name, values := range h {
		if strings.HasPrefix(strings.ToLower(name), "lambda-runtime-") {
			runtime[name] = values
		}
	}
	return Invocation{
		RequestID:  h.Get("Lambda-Runtime-Aws-Request-Id"),
		DeadlineMs: deadline,
		Headers:    runtime,
		Body:       body,
	}
}
