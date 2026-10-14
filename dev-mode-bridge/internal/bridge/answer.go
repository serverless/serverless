package bridge

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

// answer waits for the result of an accepted invocation and posts it, and returns true. If the
// session goes away (its "gone" frame, or silence, confirmed by Direct Messaging), or this
// connection ends so that the result cannot arrive, the invocation fails with
// Runtime.DevModeDisconnected; it is never run again. It returns false only when the developer's
// machine says nothing ran after all (expired, not_in_dev) and no part of a result came: the
// deployed code answers.
func (r *Relay) answer(st *relayed, backlog []protocol.Frame) bool {
	id, p := st.inv.RequestID, st.p
	t := r.d.Timing
	reorder := &reorderBuffer{}
	sawResult := false
	silence := time.NewTimer(t.SilenceCheck)
	defer silence.Stop()
	until := time.NewTimer(answerUntil(st.inv, r.d.Now()).Sub(r.d.Now()))
	defer until.Stop()
	var lastAsked time.Time
	untilCtx, cancel := context.WithDeadline(r.ctx, answerUntil(st.inv, r.d.Now()))
	defer cancel()
	stoppedAnswering := func() bool {
		return r.disconnected(st, fmt.Sprintf("The Dev Mode session %s on %s's machine stopped answering after it accepted this invocation. It was not run again.", r.d.Session.ID, r.d.Session.Owner),
			"the Dev Mode session stopped answering after it accepted the invocation")
	}
	for {
		frames := backlog
		backlog = nil
		if len(frames) == 0 {
			select {
			case <-p.signal:
				var overflow bool
				frames, overflow = r.take(p)
				if overflow {
					return r.relayFailed(st, "more of its result arrived at once than Dev Mode holds")
				}
			case <-until.C:
				return r.disconnected(st, fmt.Sprintf("No result arrived from the Dev Mode session %s on %s's machine before this invocation's deadline. It was not run again.", r.d.Session.ID, r.d.Session.Owner),
					"no result arrived before its deadline")
			case <-r.goneSignal():
				if r.d.Now().Sub(lastAsked) < goneRecheck {
					silence.Reset(goneRecheck)
					continue
				}
				lastAsked = r.d.Now()
				if r.confirmGone() {
					return stoppedAnswering()
				}
				silence.Reset(min(t.SilenceCheck, goneRecheck))
				continue
			case <-silence.C:
				lastAsked = r.d.Now()
				if r.confirmGone() {
					return stoppedAnswering()
				}
				silence.Reset(t.SilenceCheck)
				continue
			case <-st.conn.Done():
				if r.ctx.Err() != nil {
					return r.relayFailed(st, "the Dev Mode bridge stopped")
				}
				return r.disconnected(st, fmt.Sprintf("Dev Mode lost this function's connection to AWS IoT Core after the Dev Mode session %s on %s's machine accepted this invocation, so its result cannot arrive. It was not run again.", r.d.Session.ID, r.d.Session.Owner),
					"the connection to AWS IoT Core ended after it was accepted")
			case <-r.ctx.Done():
				return r.relayFailed(st, "the Dev Mode bridge stopped")
			}
		}
		if len(frames) > 0 {
			silence.Reset(t.SilenceCheck)
		}
		for _, f := range frames {
			switch f.Header.Kind {
			case protocol.KindExpired, protocol.KindNotInDev:
				if !sawResult {
					r.finish(p, outcomeDeployed)
					return r.logPass(id, "the developer's machine did not run it ("+f.Header.Kind+")")
				}
			case protocol.KindResponse, protocol.KindError, protocol.KindInitError:
				if st.stream != nil {
					continue // a stream is under way: its end carries any error
				}
				sawResult = true
				body, err := r.payloadOf(untilCtx, f)
				if errors.Is(err, errObjectTooLarge) && f.Header.Kind == protocol.KindResponse {
					return r.tooLarge(st, f.Header.Kind)
				}
				if err != nil {
					return r.relayFailed(st, fmt.Sprintf("downloading it from S3 failed (%s)", clean(err)))
				}
				r.post(st, f, body)
				return true
			case protocol.KindStreamStart, protocol.KindStreamData, protocol.KindStreamEnd:
				sawResult = true
				switch f.Header.Kind {
				case protocol.KindStreamStart:
					if st.stream == nil {
						st.stream = r.d.Upstream.stream(context.Background(), id, f.Header.ContentType)
					}
				case protocol.KindStreamData:
					body, err := r.payloadOf(untilCtx, f)
					if err != nil {
						return r.relayFailed(st, fmt.Sprintf("downloading part of its stream from S3 failed (%s)", clean(err)))
					}
					if !reorder.add(f.Header.N, body) {
						return r.relayFailed(st, "more of its stream arrived out of order than Dev Mode holds")
					}
				case protocol.KindStreamEnd:
					reorder.end(f.Header.Count, f.Header.ErrorType, f.Header.ErrorBody)
				}
				// Frames that overtook their stream_start wait for it: the content type goes first.
				if st.stream == nil {
					continue
				}
				for _, chunk := range reorder.ready() {
					if err := st.stream.Write(chunk); err != nil {
						_ = st.stream.Finish("", "")
						r.finish(p, outcomeMachine)
						r.d.Logf("%s ran on %s's machine, but the Runtime API stopped reading its stream: %s", id, r.d.Session.Owner, clean(err))
						return true
					}
				}
				if done, errorType, errorBody := reorder.complete(); done {
					err := st.stream.Finish(errorType, errorBody)
					r.finish(p, outcomeMachine)
					r.d.Logf("%s ran on %s's machine: stream in %d ms%s", id, r.d.Session.Owner, r.elapsed(st), postFailure(0, err))
					return true
				}
			}
		}
	}
}

func (r *Relay) elapsed(st *relayed) int64 { return r.d.Now().Sub(st.start).Milliseconds() }

// postFailure is what a log line adds when the Runtime API did not take a post.
func postFailure(status int, err error) string {
	switch {
	case err != nil:
		return "; posting it to the Runtime API failed: " + clean(err)
	case status >= 300:
		return fmt.Sprintf("; the Runtime API answered %d", status)
	}
	return ""
}

// confirmGone asks Direct Messaging, bypassing the cache: only "no such client" means gone.
func (r *Relay) confirmGone() bool {
	return r.live.ask(r.ctx, 3*time.Second) == awsauth.Gone
}

func (r *Relay) payloadOf(ctx context.Context, f protocol.Frame) ([]byte, error) {
	if f.Header.S3 == nil || f.Header.S3.Get == "" {
		return f.Body, nil
	}
	return r.s3.get(ctx, *f.Header.S3)
}

// post posts a buffered result and logs the invocation's one outcome line.
func (r *Relay) post(st *relayed, f protocol.Frame, body []byte) {
	ctx := context.Background()
	id := st.inv.RequestID
	var status int
	var err error
	if f.Header.Kind == protocol.KindResponse {
		status, err = r.d.Upstream.response(ctx, id, f.Header.ContentType, body)
		if err == nil && status == http.StatusRequestEntityTooLarge {
			r.tooLarge(st, f.Header.Kind)
			return
		}
	} else {
		errorType := f.Header.ErrorType
		if errorType == "" {
			errorType = "Runtime.Unknown"
		}
		status, err = r.d.Upstream.error(ctx, id, errorType, body)
	}
	r.finish(st.p, outcomeMachine)
	r.d.Logf("%s ran on %s's machine: %s in %d ms%s", id, r.d.Session.Owner, f.Header.Kind, r.elapsed(st), postFailure(status, err))
}

// tooLarge answers as Lambda does for a response above its limit.
func (r *Relay) tooLarge(st *relayed, kind string) bool {
	status, err := r.fail(st.inv.RequestID, "Function.ResponseSizeTooLarge", tooLargeMessage)
	r.finish(st.p, outcomeMachine)
	r.d.Logf("%s ran on %s's machine: %s in %d ms, larger than Lambda allows (Function.ResponseSizeTooLarge)%s", st.inv.RequestID, r.d.Session.Owner, kind, r.elapsed(st), postFailure(status, err))
	return true
}

// relayFailed ends an accepted invocation whose result Dev Mode could not carry; reason is clean.
func (r *Relay) relayFailed(st *relayed, reason string) bool {
	message := fmt.Sprintf("Dev Mode could not carry the result of this invocation back from %s's machine: %s.", r.d.Session.Owner, reason)
	status, err := r.failWith(st, "Runtime.DevModeRelayFailed", message)
	r.finish(st.p, outcomeMachine)
	r.d.Logf("%s ran on %s's machine, but Dev Mode could not carry its result: %s%s", st.inv.RequestID, r.d.Session.Owner, reason, postFailure(status, err))
	return true
}

// disconnected ends an accepted invocation whose result cannot arrive.
func (r *Relay) disconnected(st *relayed, message, logReason string) bool {
	status, err := r.failWith(st, "Runtime.DevModeDisconnected", message)
	r.finish(st.p, outcomeMachine)
	r.d.Logf("%s failed: %s%s", st.inv.RequestID, logReason, postFailure(status, err))
	return true
}

// failWith posts an error: in the trailers of a stream under way, or as the invocation's error.
func (r *Relay) failWith(st *relayed, errorType, message string) (int, error) {
	if st.stream != nil {
		return 0, st.stream.Finish(errorType, base64.StdEncoding.EncodeToString(errorBody(errorType, cleanText(message))))
	}
	return r.fail(st.inv.RequestID, errorType, message)
}

// fail posts an error result; message is redacted before it is encoded.
func (r *Relay) fail(id, errorType, message string) (int, error) {
	return r.d.Upstream.error(context.Background(), id, errorType, errorBody(errorType, cleanText(message)))
}
