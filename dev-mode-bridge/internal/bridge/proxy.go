package bridge

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Logf is the bridge's logger; Lambda sends stderr to CloudWatch Logs.
type Logf func(format string, args ...any)

// MaxEventBytes bounds what the bridge reads of one /next body to offer it to the relay (Lambda's
// request limit is 6 MB). A larger event is never cut short: it goes to the deployed code whole.
const MaxEventBytes = 6*1024*1024 + 64*1024

// NewHandler returns the Runtime API proxy in front of target.
//
//   - With a relay, GET /runtime/invocation/next is the bridge's own: it fetches the invocation
//     from the real Runtime API, offers it to relay, and either hands that same response to the
//     runtime (the deployed code answers) or, when relay answered it, fetches the next invocation
//     for the runtime and offers that one. The bridge calls the Runtime API only while a runtime
//     request is in progress, so a bridge the wrapper gave up on can never take an invocation.
//     Without a relay (nil), /next passes through like everything else.
//   - Everything else passes through a reverse proxy. Rewrite shares the inbound trailer map with
//     the outbound request: Request.Clone copies the map before the server fills it, so a stock
//     ReverseProxy forwards empty Lambda-Runtime-Function-Error-Type/-Body trailers.
//   - FlushInterval -1 flushes every write, so streamed responses are never buffered.
//   - Transport.Proxy stays nil: HTTP(S)_PROXY in the function's environment must never redirect
//     Runtime API traffic (the Runtime API is often 169.254.100.1, which is not exempt).
//   - No timeouts: /invocation/next long-polls for as long as the environment is idle.
func NewHandler(target *url.URL, relay Relayer, logf Logf) http.Handler {
	transport := &http.Transport{
		Proxy:               nil,
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 64,
		DisableCompression:  true,
	}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = pr.In.Host
			if len(pr.In.Trailer) > 0 {
				pr.Out.Trailer = pr.In.Trailer
			}
		},
		FlushInterval: -1,
		Transport:     transport,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logf("Runtime API request %s %s failed: %s", r.Method, r.URL.Path, clean(err))
			w.WriteHeader(http.StatusBadGateway)
		},
	}
	if relay == nil {
		return proxy
	}
	next := &nextHandler{
		client: &http.Client{Transport: transport},
		target: target,
		relay:  relay,
		logf:   logf,
	}
	next.waiter, _ = relay.(runtimeWaiter)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && isNext(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	})
}

func isNext(path string) bool { return strings.HasSuffix(path, "/runtime/invocation/next") }

// runtimeWaiter is a Relayer told when the runtime starts and stops waiting for its next
// invocation (the Runtime API holds its /next). Lambda freezes the execution environment while the
// runtime waits, and thaws it only for that invocation or to shut the environment down, maybe after
// the function was deleted: a bridge writes nothing to the function's log while the runtime waits.
type runtimeWaiter interface {
	runtimeWaiting(waiting bool)
}

type nextHandler struct {
	client *http.Client
	target *url.URL
	relay  Relayer
	waiter runtimeWaiter // nil when the relay does not ask
	logf   Logf
}

// fetch is the runtime's /next at the real Runtime API, which holds it until an invocation comes.
func (n *nextHandler) fetch(req *http.Request) (*http.Response, error) {
	if n.waiter != nil {
		n.waiter.runtimeWaiting(true)
		defer n.waiter.runtimeWaiting(false)
	}
	return n.client.Do(req)
}

func (n *nextHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for {
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, n.target.String()+r.URL.Path, nil)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		for name, values := range r.Header {
			req.Header[name] = values
		}
		resp, err := n.fetch(req)
		if err != nil {
			// A runtime that gives up on its request (its process ended) is not a bridge failure.
			if !errors.Is(err, context.Canceled) {
				n.logf("Runtime API request GET %s failed: %s", r.URL.Path, clean(err))
			}
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, MaxEventBytes+1))
		if err != nil {
			resp.Body.Close()
			if !errors.Is(err, context.Canceled) {
				n.logf("reading an invocation from the Runtime API failed: %s", clean(err))
			}
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		if len(body) > MaxEventBytes {
			// Never cut an event short: the rest follows what was read, to the deployed code.
			n.logf("%s ran the deployed code: its event is larger than Dev Mode relays", resp.Header.Get("Lambda-Runtime-Aws-Request-Id"))
			copyHeader(w, resp)
			_, _ = w.Write(body)
			_, _ = io.Copy(w, resp.Body)
			resp.Body.Close()
			return
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK && n.offer(invocationFrom(resp.Header, body)) {
			continue
		}
		copyHeader(w, resp)
		_, _ = w.Write(body)
		return
	}
}

func copyHeader(w http.ResponseWriter, resp *http.Response) {
	for name, values := range resp.Header {
		w.Header()[name] = values
	}
	w.WriteHeader(resp.StatusCode)
}

// offer asks the relay and never lets it take an invocation down: a panic means the deployed code
// answers. The relay gets its own context: the runtime's request is not what ends an invocation.
func (n *nextHandler) offer(inv Invocation) (handled bool) {
	defer func() {
		if p := recover(); p != nil {
			n.logf("relaying %s failed (%s); the deployed code answers", inv.RequestID, cleanText(p))
			handled = false
		}
	}()
	return n.relay.Handle(context.Background(), inv)
}
