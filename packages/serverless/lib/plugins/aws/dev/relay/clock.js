/**
 * Lambda's clock seen from this machine. The bridge stamps each invoke with its own time when it
 * offers it (`sentAt`) and the time left then (`remainingMs`); this machine's clock may be seconds
 * off. The smallest (arrival - sentAt) seen is the clock offset plus the fastest trip, so a
 * request's extra delay over that is its age, and its deadline on this machine's clock is its
 * arrival minus its age plus the time it had left, less the trip back.
 *
 * The fastest trip counts until a slower one has held for a whole minute (CLOCK_WINDOW_MS): that
 * is how a clock that jumped forward (a laptop waking up, a time sync) is trusted again, while a
 * quiet minute alone never makes a late request look fresh. `reset()` (on every reconnect) forgets
 * the trips but keeps the last offset as an anchor.
 *
 * The first request of a session (no trip and no anchor yet) is measured against itself only when
 * its delay is within FIRST_REQUEST_SKEW_MS; a longer delay is its age (too old once it leaves no
 * time to accept the request), until a later request confirms that delay as the offset.
 *
 * A request is stale, and is refused without counting as a trip, when it cannot be a request the
 * bridge offered moments ago: its delay is beyond the acceptance window plus MAX_CLOCK_DRIFT_MS
 * from the offset known (or the anchor), or, before any offset is known, beyond the acceptance
 * window plus MAX_CLOCK_SKEW_MS. A replayed invoke is stale.
 */
export const RETURN_TRIP_MS = 200
/** How long a bridge waits for an acceptance after it offers an invoke (its AcceptWindow). */
export const ACCEPT_WINDOW_MS = 3_000
/** How long a slower trip must hold before the faster ones before it stop counting. */
export const CLOCK_WINDOW_MS = 60_000
/**
 * How far this machine's clock may move against AWS's between two requests, or across a
 * reconnect, before a request is taken for a replay. A clock that moves further (set by hand)
 * refuses every request until `serverless dev` starts again.
 */
export const MAX_CLOCK_DRIFT_MS = 60_000
/**
 * The largest difference between this machine's clock and AWS's that still lets it connect: AWS
 * refuses requests signed more than 5 minutes away from its own time, and the connection to AWS
 * IoT Core is a signed request. It bounds the first request of a session, which has no offset to
 * be measured against.
 */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000
/**
 * The first request of a session has no trip to be measured against, so its delay alone cannot
 * tell a clock that is off from a request that waited (a machine that was frozen or asleep while
 * the bridge offered it, and that reads its connection on waking). A delay up to this much is
 * taken as the trip plus this machine's clock being a little off, and the request is measured as
 * fresh; a longer one is taken as the request's age, as if both clocks were right, so a request
 * too old to be accepted in time is refused: the deployed code answers it.
 *
 * Why 1 s: a clock kept by the operating system is within tens of milliseconds of AWS's, and a
 * trip from the bridge took 0.1–0.8 s in live runs, while a machine frozen for 17 s read an offer
 * that was about 6 s old. The cost: on a machine whose clock is more than about 1 s ahead, the
 * first request of a session is measured as older than it is, and it is refused (the deployed
 * code answers it) once that age leaves no time to accept it, at 1.5 s (ACCEPT_WINDOW_MS less
 * relay.js's ACCEPT_RETURN_MS, kept for the acceptance's trip back): with a usual trip, a clock
 * about 1.2 s or more ahead refuses its first request. The offset is learned from the next one
 * (OFFSET_CONFIRM_*).
 * Refusing is the safe side: a refused request runs once, on the deployed code; an accepted late
 * one runs twice.
 */
export const FIRST_REQUEST_SKEW_MS = 1_000
/**
 * A first request's long delay becomes the offset once a later request, arriving at least
 * OFFSET_CONFIRM_GAP_MS after it, shows the same delay within OFFSET_CONFIRM_TOLERANCE_MS: a clock
 * that is off delays every request alike. Requests queued while the machine was frozen arrive
 * together, each with a different delay, and confirm nothing.
 */
export const OFFSET_CONFIRM_GAP_MS = 1_000
export const OFFSET_CONFIRM_TOLERANCE_MS = 1_000

/**
 * The most time an offered invocation can have left: Lambda's longest timeout (15 minutes), plus
 * the acceptance window for the clocks' disagreement. A `remainingMs` above it is no Lambda's, and
 * is taken as unknown: no deadline.
 */
export const MAX_REMAINING_MS = 15 * 60_000 + ACCEPT_WINDOW_MS

/** The time an invoke had left, in ms, or null when it is absent, not positive or implausible. */
export const remainingOf = (remainingMs) => {
  const remaining = Number(remainingMs)
  return Number.isFinite(remaining) &&
    remaining > 0 &&
    remaining <= MAX_REMAINING_MS
    ? remaining
    : null
}

const STALE = Object.freeze({ ageMs: 0, deadline: null, stale: true })

export const createLambdaClock = ({ windowMs = CLOCK_WINDOW_MS } = {}) => {
  // The trips that can still be the fastest, oldest first, each no faster than the one before it:
  // the first is the fastest.
  let trips = []
  // The offset before the last reset, or null before the first trip of the session.
  let anchor = null
  // The last first request refused as too old, `{ at, lag }`, until an offset is known.
  let unconfirmed = null

  const deadlineOf = (receivedAt, ageMs, remainingMs) => {
    const remaining = remainingOf(remainingMs)
    return remaining === null
      ? null
      : receivedAt - ageMs + remaining - RETURN_TRIP_MS
  }

  /**
   * Before any offset is known: true when the request may be measured as usual (its delay is
   * taken as the trip, or it confirms the delay of an earlier one); false when its delay must be
   * its age.
   */
  const firstTrip = (lag, receivedAt) => {
    if (lag <= FIRST_REQUEST_SKEW_MS) return true
    const confirmed =
      unconfirmed !== null &&
      receivedAt - unconfirmed.at >= OFFSET_CONFIRM_GAP_MS &&
      Math.abs(lag - unconfirmed.lag) <= OFFSET_CONFIRM_TOLERANCE_MS
    if (confirmed) {
      trips = [unconfirmed]
      return true
    }
    unconfirmed = { at: receivedAt, lag }
    return false
  }

  const isStale = (lag) => {
    const reference = trips.length ? trips[0].lag : anchor
    if (reference === null) {
      return (
        lag > ACCEPT_WINDOW_MS + MAX_CLOCK_SKEW_MS || lag < -MAX_CLOCK_SKEW_MS
      )
    }
    return (
      lag > reference + ACCEPT_WINDOW_MS + MAX_CLOCK_DRIFT_MS ||
      lag < reference - MAX_CLOCK_DRIFT_MS
    )
  }

  return {
    /**
     * `{ ageMs, deadline }`; deadline is null when the bridge did not know the deadline. A request
     * that cannot be judged (no `sentAt`) or cannot be one the bridge just offered is
     * `{ ageMs: 0, deadline: null, stale: true }`.
     */
    observe({ sentAt, remainingMs, receivedAt }) {
      const lag = typeof sentAt === 'number' ? receivedAt - sentAt : Number.NaN
      if (!Number.isFinite(lag) || isStale(lag)) return STALE
      if (!trips.length && anchor === null && !firstTrip(lag, receivedAt)) {
        return {
          ageMs: lag,
          deadline: deadlineOf(receivedAt, lag, remainingMs),
        }
      }
      unconfirmed = null
      // A trip slower than a later one never counts again; one as fast keeps its earlier time.
      while (trips.length && trips[trips.length - 1].lag > lag) trips.pop()
      trips.push({ at: receivedAt, lag })
      // Measured before anything is forgotten: the fastest trip still counts for this request.
      const ageMs = lag - trips[0].lag
      // A faster trip stops counting once the slower one after it has held for a whole window.
      while (trips.length > 1 && trips[1].at <= receivedAt - windowMs) {
        trips.shift()
      }
      return { ageMs, deadline: deadlineOf(receivedAt, ageMs, remainingMs) }
    },
    /** Forgets every trip seen; the offset they gave stays as the anchor for the next ones. */
    reset() {
      if (trips.length) anchor = trips[0].lag
      trips = []
    },
  }
}
