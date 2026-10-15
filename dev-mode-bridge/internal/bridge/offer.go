package bridge

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/serverless/serverless/dev-mode-bridge/internal/awsauth"
	"github.com/serverless/serverless/dev-mode-bridge/internal/protocol"
)

func (r *Relay) handle(ctx context.Context, st *relayed) (answered bool) {
	inv := st.inv
	id := inv.RequestID
	t := r.d.Timing
	if id == "" {
		return r.logPass(id, "it has no request id")
	}
	timeLeft := func() time.Duration { return time.UnixMilli(inv.DeadlineMs).Sub(r.d.Now()) }
	remaining := time.Duration(0)
	if inv.DeadlineMs > 0 {
		remaining = time.UnixMilli(inv.DeadlineMs).Sub(st.start)
		if remaining < t.MinRemaining+t.MinAcceptWindow {
			return r.logPass(id, "too little time left to relay it")
		}
	}
	wait := t.ConnectWait
	if remaining > 0 && wait > remaining/3 {
		wait = remaining / 3
	}
	conn, epoch, err := r.link.get(ctx, wait)
	if err != nil {
		// The session could not be reached: counted, unless the bridge is stopping or the
		// runtime's own request ended.
		if !errors.Is(err, errClosed) && ctx.Err() == nil {
			r.away.add(st.start)
		}
		return r.logPass(id, fmt.Sprintf("no connection to AWS IoT Core (%s)", clean(err)))
	}
	defer func() {
		defer func() { r.link.release(conn, answered) }()
		// A panic is recovered here, before the connection is released, so that an invocation it
		// fails after acceptance counts as answered by the bridge (see link.release).
		if p := recover(); p != nil {
			answered = r.recovered(st, p)
		}
	}()
	st.conn = conn
	defer func() {
		if st.suspect || st.replace {
			r.link.broken(conn)
		}
	}()
	if state := r.live.check(ctx); state == awsauth.Gone {
		r.away.add(st.start)
		return r.logPass(id, "the Dev Mode session is gone")
	}
	p, ok := r.register(id)
	if !ok {
		return r.logPass(id, "it is already being relayed, or the relay has stopped")
	}
	st.p = p
	pass := func(reason string) bool {
		r.finish(p, outcomeDeployed)
		return r.logPass(id, reason)
	}

	// sentAt and remainingMs are stamped at the offer, below; these are only for the size check.
	header := protocol.Header{
		Kind:    protocol.KindInvoke,
		Env:     r.d.Session.Environment,
		Fn:      r.d.Session.FunctionName,
		ID:      id,
		Headers: lowerHeaders(inv.Headers),
	}
	stamp(&header, inv, st.start)
	r.mu.Lock()
	sendEnvironment := r.envSentAt != epoch
	r.mu.Unlock()
	if sendEnvironment {
		header.Environment = r.environment()
	}
	body := inv.Body
	if !protocol.FitsOneMessage(header, body) {
		upload, reason := r.uploadURL(conn, id, p)
		if reason != "" {
			return pass(reason)
		}
		putFor := 30 * time.Second
		if inv.DeadlineMs > 0 && timeLeft()/2 < putFor {
			putFor = timeLeft() / 2
		}
		putCtx, cancel := context.WithTimeout(r.ctx, putFor)
		version, err := r.s3.put(putCtx, upload, body)
		cancel()
		if err != nil {
			return pass(fmt.Sprintf("uploading its event failed (%s)", clean(err)))
		}
		header.S3 = &protocol.S3Object{Key: upload.Key, VersionID: version}
		body = nil
	}
	// One acceptance window per offer: every wait below (the publish, the acceptance itself) ends
	// by acceptAt. It leaves the deployed code at least MinRemaining when the window closes without
	// an acceptance. The invoke is stamped at the offer too: the developer's machine measures how
	// late it arrived from sentAt, so the time spent before it (connecting, the liveness check, an
	// upload) must not count as its age. The invoke sent again after need_environment is a new
	// offer, with a stamp and a window of its own.
	offeredAt := r.d.Now()
	stamp(&header, inv, offeredAt)
	payload, err := r.sealer.Seal(r.up(), header, body)
	if err != nil {
		return pass(fmt.Sprintf("sealing it failed (%s)", clean(err)))
	}
	acceptAt := r.acceptUntil(inv, offeredAt)
	acceptBy := acceptAt.Sub(offeredAt)
	if acceptBy <= 0 || acceptBy < t.MinAcceptWindow {
		// A window this short would only time out the publish and drop the connection.
		return pass("too little time left to relay it")
	}
	expiry := uint32((t.AcceptWindow + time.Second - 1) / time.Second)
	publishCtx, cancel := context.WithTimeout(r.ctx, acceptBy)
	publishErr := conn.Publish(publishCtx, r.up(), payload, expiry)
	cancel()
	if publishErr == nil {
		// The session is reachable again: tell it what ran the deployed code meanwhile.
		st.replace = r.reportAway(conn, acceptAt, expiry)
	}
	if publishErr != nil {
		switch {
		case refused(publishErr):
			// The broker refused it: nothing was delivered.
			r.link.broken(conn)
			if r.withdraw(p) {
				return r.logPass(id, fmt.Sprintf("publishing it was refused (%s)", clean(publishErr)))
			}
			publishErr = nil
		case ended(conn):
			// The invoke may have been delivered and only its PUBACK lost: an acceptance can no
			// longer arrive over this connection.
			r.link.broken(conn)
			if r.withdrawCounting(p, true) {
				return r.logPass(id, lostAcceptanceReason)
			}
			publishErr = nil
		default:
			st.suspect, st.suspectErr = true, publishErr
		}
	}
	if sendEnvironment {
		r.mu.Lock()
		r.envSentAt = epoch
		r.mu.Unlock()
	}
	backlog, accepted := r.awaitAcceptance(st, header, body, expiry, acceptAt, acceptBy)
	if !accepted {
		return false
	}
	return r.answer(st, backlog)
}

// stamp sets when an invoke is offered and the time it has left then: the developer's machine
// measures its age and deadline from them.
func stamp(header *protocol.Header, inv Invocation, at time.Time) {
	header.SentAt = at.UnixMilli()
	header.RemainingMs = 0
	if inv.DeadlineMs > 0 {
		// 0 means unknown on the wire: a known deadline is at least 1 ms.
		header.RemainingMs = max(time.UnixMilli(inv.DeadlineMs).Sub(at).Milliseconds(), 1)
	}
}

// acceptUntil is when the acceptance window of an offer made at `at` closes: AcceptWindow later,
// but never so late that the deployed code has less than MinRemaining.
func (r *Relay) acceptUntil(inv Invocation, at time.Time) time.Time {
	acceptAt := at.Add(r.d.Timing.AcceptWindow)
	if inv.DeadlineMs > 0 {
		if latest := time.UnixMilli(inv.DeadlineMs).Add(-r.d.Timing.MinRemaining); latest.Before(acceptAt) {
			acceptAt = latest
		}
	}
	return acceptAt
}

// awaitAcceptance waits for the developer's machine to take the invocation. It returns the frames
// that follow the acceptance, or false once the deployed code has it (logged).
func (r *Relay) awaitAcceptance(st *relayed, header protocol.Header, body []byte, expiry uint32, acceptAt time.Time, acceptBy time.Duration) ([]protocol.Frame, bool) {
	id, p, conn := st.inv.RequestID, st.p, st.conn
	// What is left of the one window: a publish that used it all up leaves nothing.
	timer := time.NewTimer(max(acceptAt.Sub(r.d.Now()), 0))
	defer timer.Stop()
	resent := false
	// passIf hands the invocation to the deployed code unless an acceptance got in first; then
	// the queue holds it, and the next round takes it. A reason that ends in mayAlsoHaveRunIt is
	// a counted line (see the list above lateAcceptanceLine).
	passIf := func(reason string) bool {
		if r.withdrawCounting(p, strings.HasSuffix(reason, mayAlsoHaveRunIt)) {
			r.logPass(id, reason)
			return true
		}
		return false
	}
	queued := false
	for {
		if !queued {
			select {
			case <-p.signal:
			case <-timer.C:
				reason := fmt.Sprintf("not accepted within %d ms", acceptBy.Milliseconds())
				if st.suspect {
					// The machine may have the invoke, and the distrusted connection is dropped at
					// the hand-off, so its acceptance would never be seen: counted here.
					reason = fmt.Sprintf("its publish was not acknowledged and no acceptance arrived within %d ms (%s); %s", acceptBy.Milliseconds(), clean(st.suspectErr), mayAlsoHaveRunIt)
				}
				if passIf(reason) {
					return nil, false
				}
			case <-conn.Done():
				if passIf(lostAcceptanceReason) {
					return nil, false
				}
			case <-r.ctx.Done():
				reason := "the relay has stopped"
				if st.suspect {
					reason = fmt.Sprintf("the relay has stopped (its publish was not acknowledged: %s); %s", clean(st.suspectErr), mayAlsoHaveRunIt)
				}
				if passIf(reason) {
					return nil, false
				}
			}
		}
		queued = false
		frames, _ := r.take(p)
		for i, f := range frames {
			switch f.Header.Kind {
			case protocol.KindAccepted:
				st.accepted = true
				return frames[i+1:], true
			case protocol.KindResponse, protocol.KindError, protocol.KindInitError,
				protocol.KindStreamStart, protocol.KindStreamData, protocol.KindStreamEnd:
				// A reply that overtook its acceptance (AWS IoT Core does not keep order).
				st.accepted = true
				return frames[i:], true
			case protocol.KindExpired, protocol.KindNotInDev:
				if passIf("the developer's machine did not take it (" + f.Header.Kind + ")") {
					return nil, false
				}
				queued = true
			case protocol.KindNeedEnvironment:
				if resent || header.S3 != nil {
					if passIf("the developer's machine asked for the environment again") {
						return nil, false
					}
					queued = true
					continue
				}
				resent = true
				// A new offer: the machine could not take the first one, so the window starts
				// again from now (capped like the first), and the stamp says so. Kept, the first
				// stamp would make the machine count its question's round trip as age.
				resentAt := r.d.Now()
				acceptAt = r.acceptUntil(st.inv, resentAt)
				acceptBy = acceptAt.Sub(resentAt)
				if acceptBy < r.d.Timing.MinAcceptWindow {
					if passIf("too little time left to relay it") {
						return nil, false
					}
					queued = true
					continue
				}
				timer.Reset(acceptBy)
				stamp(&header, st.inv, resentAt)
				header.Environment = r.environment()
				payload, err := r.sealer.Seal(r.up(), header, body)
				if err == nil {
					ctx, cancel := context.WithDeadline(r.ctx, acceptAt)
					err = conn.Publish(ctx, r.up(), payload, expiry)
					cancel()
					switch {
					case err == nil:
					case refused(err):
						r.link.broken(conn)
						err = fmt.Errorf("publishing it again was refused (%s)", clean(err))
					case ended(conn):
						// It may have been delivered, and an acceptance can no longer arrive.
						r.link.broken(conn)
						err = errors.New(lostAcceptanceReason)
					default:
						// It may have arrived: keep waiting for the window on this connection.
						st.suspect, st.suspectErr = true, err
						err = nil
					}
				} else {
					err = fmt.Errorf("sealing it again failed (%s)", clean(err))
				}
				if err != nil {
					if passIf(err.Error()) {
						return nil, false
					}
					queued = true
				}
			}
		}
	}
}

// answerUntil is when the bridge stops waiting for a result: shortly after Lambda's own deadline,
// when Lambda has already ended the invocation.
func answerUntil(inv Invocation, now time.Time) time.Time {
	if inv.DeadlineMs > 0 {
		return time.UnixMilli(inv.DeadlineMs).Add(time.Second)
	}
	return now.Add(MaxInvocation)
}

// uploadURL returns a spare presigned PUT URL, or asks the developer's machine for one; a
// non-empty reason says why there is none.
func (r *Relay) uploadURL(conn BrokerConn, id string, p *pendingInv) (protocol.Upload, string) {
	if u, ok := r.uploads.take(); ok {
		return u, ""
	}
	payload, err := r.sealer.Seal(r.up(), protocol.Header{Kind: protocol.KindUploadURLRequest, Env: r.d.Session.Environment, ID: id}, nil)
	if err == nil {
		ctx, cancel := context.WithTimeout(r.ctx, r.d.Timing.UploadWait)
		err = conn.Publish(ctx, r.up(), payload, 2)
		cancel()
		if err != nil {
			r.link.broken(conn)
		}
	}
	if err != nil {
		return protocol.Upload{}, fmt.Sprintf("its event is larger than one message and asking for an upload URL failed (%s)", clean(err))
	}
	timer := time.NewTimer(r.d.Timing.UploadWait)
	defer timer.Stop()
	for {
		select {
		case <-p.signal:
			frames, _ := r.take(p)
			var found *protocol.Upload
			for _, f := range frames {
				switch {
				case f.Header.Kind == protocol.KindUploadURL && f.Header.Upload != nil:
					if found == nil {
						found = f.Header.Upload
					} else {
						r.uploads.put(*f.Header.Upload)
					}
				case f.Header.Kind == protocol.KindExpired || f.Header.Kind == protocol.KindNotInDev:
					if found == nil {
						return protocol.Upload{}, "the developer's machine did not take it (" + f.Header.Kind + ")"
					}
				}
			}
			if found != nil {
				return *found, ""
			}
		case <-timer.C:
			return protocol.Upload{}, "its event is larger than one message and no upload URL arrived in time"
		case <-conn.Done():
			return protocol.Upload{}, "the connection to AWS IoT Core ended"
		case <-r.ctx.Done():
			return protocol.Upload{}, "the relay has stopped"
		}
	}
}
