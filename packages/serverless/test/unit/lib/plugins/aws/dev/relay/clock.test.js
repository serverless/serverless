import { describe, expect, test } from '@jest/globals'
import {
  ACCEPT_WINDOW_MS,
  CLOCK_WINDOW_MS,
  MAX_CLOCK_DRIFT_MS,
  MAX_CLOCK_SKEW_MS,
  FIRST_REQUEST_SKEW_MS,
  MAX_REMAINING_MS,
  OFFSET_CONFIRM_GAP_MS,
  RETURN_TRIP_MS,
  createLambdaClock,
} from '../../../../../../../lib/plugins/aws/dev/relay/clock.js'

describe("Lambda's clock on this machine", () => {
  test('a machine clock 5 s ahead: its first request runs the deployed code; after that, requests neither expire nor have their deadline stretched', () => {
    const clock = createLambdaClock()
    const skew = 5_000
    const lambdaNow = 1_000_000
    // Fastest trip 100 ms; the machine's clock reads 5 s ahead of Lambda's. The first request
    // cannot be told from one that waited 5 s, and is measured as that old.
    const first = clock.observe({
      sentAt: lambdaNow,
      remainingMs: 3_000,
      receivedAt: lambdaNow + skew + 100,
    })
    expect(first.ageMs).toBe(skew + 100)
    expect(first.deadline).toBe(lambdaNow + 3_000 - RETURN_TRIP_MS)
    // The next one, 10 s later, shows the same delay: the offset is confirmed.
    // A later request that took 700 ms: 600 ms older than the fastest.
    const slow = clock.observe({
      sentAt: lambdaNow + 10_000,
      remainingMs: 3_000,
      receivedAt: lambdaNow + 10_000 + skew + 700,
    })
    expect(slow.ageMs).toBe(600)
    expect(slow.deadline).toBe(
      lambdaNow + 10_000 + skew + 100 + 3_000 - RETURN_TRIP_MS,
    )
  })

  test('a clock behind Lambda works the same way', () => {
    const clock = createLambdaClock()
    const a = clock.observe({
      sentAt: 50_000,
      remainingMs: 1_000,
      receivedAt: 40_150,
    })
    expect(a.ageMs).toBe(0)
    expect(a.deadline).toBe(40_150 + 1_000 - RETURN_TRIP_MS)
    const b = clock.observe({
      sentAt: 60_000,
      remainingMs: 1_000,
      receivedAt: 50_400,
    })
    expect(b.ageMs).toBe(250)
    expect(b.deadline).toBe(50_400 - 250 + 1_000 - RETURN_TRIP_MS)
  })

  test('more time left than a Lambda invocation can have is taken as unknown', () => {
    expect(MAX_REMAINING_MS).toBe(15 * 60_000 + ACCEPT_WINDOW_MS)
    for (const remainingMs of [MAX_REMAINING_MS + 1, 1e15, 2 ** 31]) {
      const clock = createLambdaClock()
      expect(
        clock.observe({ sentAt: 1, remainingMs, receivedAt: 2 }).deadline,
      ).toBeNull()
    }
    const clock = createLambdaClock()
    expect(
      clock.observe({ sentAt: 1, remainingMs: 15 * 60_000, receivedAt: 2 })
        .deadline,
    ).toBe(2 + 15 * 60_000 - RETURN_TRIP_MS)
  })

  test('an unknown deadline stays unknown; a request without sentAt cannot be judged and is stale', () => {
    const clock = createLambdaClock()
    expect(
      clock.observe({ sentAt: 1, remainingMs: 0, receivedAt: 2 }).deadline,
    ).toBeNull()
    expect(clock.observe({ sentAt: 1, receivedAt: 2 }).deadline).toBeNull()
    for (const sentAt of [undefined, null, '1', Number.NaN]) {
      expect(clock.observe({ sentAt, remainingMs: 10, receivedAt: 2 })).toEqual(
        { ageMs: 0, deadline: null, stale: true },
      )
    }
  })

  test('a request after a quiet minute is still measured against the last trip seen', () => {
    const clock = createLambdaClock()
    clock.observe({
      sentAt: 1_000_000,
      remainingMs: 10_000,
      receivedAt: 1_000_100,
    })
    // 90 s later, with nothing in between, a request that was 2.5 s on its way.
    const late = clock.observe({
      sentAt: 1_090_000,
      remainingMs: 10_000,
      receivedAt: 1_090_000 + 100 + 2_500,
    })
    expect(late.ageMs).toBe(2_500)
    // The next one, as late, a moment later: still late.
    expect(
      clock.observe({
        sentAt: 1_100_000,
        remainingMs: 10_000,
        receivedAt: 1_100_000 + 100 + 2_500,
      }).ageMs,
    ).toBe(2_500)
  })

  test('a request is measured before a minute-old slower trip replaces the fastest one', () => {
    const clock = createLambdaClock()
    // The fastest trip, 200 ms; then one 2 s slower (a stalled network), then a quiet minute.
    clock.observe({ sentAt: 0, remainingMs: 10_000, receivedAt: 200 })
    expect(
      clock.observe({ sentAt: 1_000, remainingMs: 10_000, receivedAt: 3_200 })
        .ageMs,
    ).toBe(2_000)
    // A request 2.5 s older than the fastest trip, a minute after the slower one: still 2.5 s old.
    const late = clock.observe({
      sentAt: 62_000,
      remainingMs: 10_000,
      receivedAt: 62_000 + 200 + 2_500,
    })
    expect(late.ageMs).toBe(2_500)
    // From the next request on, the slower trip is the one that counts.
    expect(
      clock.observe({ sentAt: 63_000, remainingMs: 10_000, receivedAt: 65_200 })
        .ageMs,
    ).toBe(0)
  })

  test('a clock that jumps forward 5 s is trusted again once the new offset held a minute', () => {
    const clock = createLambdaClock()
    let lambda = 1_000_000
    let machine = lambda + 100
    const observe = () =>
      clock.observe({
        sentAt: lambda,
        remainingMs: 10_000,
        receivedAt: machine,
      })
    expect(observe().ageMs).toBe(0)
    // The machine's clock jumps 5 s ahead: every request looks 5 s older than it is...
    lambda += 1_000
    machine += 1_000 + 5_000
    expect(observe().ageMs).toBe(5_000)
    // ...until the new offset has held for a whole window.
    for (let elapsed = 10_000; elapsed < CLOCK_WINDOW_MS; elapsed += 10_000) {
      lambda += 10_000
      machine += 10_000
      expect(observe().ageMs).toBe(5_000)
    }
    // The request that completes the minute is still measured against the old offset...
    lambda += 10_000
    machine += 10_000
    expect(observe().ageMs).toBe(5_000)
    // ...and the next one against the new.
    lambda += 1_000
    machine += 1_000
    const after = observe()
    expect(after.ageMs).toBe(0)
    expect(after.deadline).toBe(machine + 10_000 - RETURN_TRIP_MS)
  })

  test('the fastest trip counts until a slower one has held for a minute', () => {
    const clock = createLambdaClock()
    clock.observe({ sentAt: 0, remainingMs: 5_000, receivedAt: 50 })
    expect(
      clock.observe({ sentAt: 30_000, remainingMs: 5_000, receivedAt: 30_400 })
        .ageMs,
    ).toBe(350)
    expect(
      clock.observe({ sentAt: 61_000, remainingMs: 5_000, receivedAt: 61_450 })
        .ageMs,
    ).toBe(400)
    // The 400 ms trip at 30.4 s has held for a minute: the 50 ms one no longer counts, from the
    // request after the one that shows it.
    expect(
      clock.observe({ sentAt: 91_000, remainingMs: 5_000, receivedAt: 91_450 })
        .ageMs,
    ).toBe(400)
    expect(
      clock.observe({ sentAt: 92_000, remainingMs: 5_000, receivedAt: 92_450 })
        .ageMs,
    ).toBe(50)
  })

  test('reset forgets every trip seen, as after a reconnect', () => {
    const clock = createLambdaClock()
    clock.observe({ sentAt: 0, remainingMs: 5_000, receivedAt: 100 })
    expect(
      clock.observe({ sentAt: 1_000, remainingMs: 5_000, receivedAt: 1_900 })
        .ageMs,
    ).toBe(800)
    clock.reset()
    expect(
      clock.observe({ sentAt: 2_000, remainingMs: 5_000, receivedAt: 2_900 })
        .ageMs,
    ).toBe(0)
  })

  test('after a reconnect, an invoke from minutes ago is stale; a genuine one, or a clock moved 5 s, is not', () => {
    const clock = createLambdaClock()
    const lambda = 10_000_000
    clock.observe({
      sentAt: lambda,
      remainingMs: 5_000,
      receivedAt: lambda + 120,
    })
    clock.reset()
    // A captured invoke replayed 9 minutes later, then one replayed 2 minutes later.
    for (const ago of [9 * 60_000, 2 * 60_000]) {
      expect(
        clock.observe({
          sentAt: lambda + 600_000 - ago,
          remainingMs: 900_000,
          receivedAt: lambda + 600_000 + 120,
        }),
      ).toEqual({ ageMs: 0, deadline: null, stale: true })
    }
    // The bridge's own invoke, offered just now, after this machine's clock moved 5 s ahead.
    const genuine = clock.observe({
      sentAt: lambda + 600_000,
      remainingMs: 5_000,
      receivedAt: lambda + 600_000 + 120 + 5_000,
    })
    expect(genuine).toEqual({
      ageMs: 0,
      deadline: lambda + 600_000 + 120 + 5_000 + 5_000 - RETURN_TRIP_MS,
    })
    // Stale requests never became trips: another replay is still stale after a second reset.
    clock.reset()
    expect(
      clock.observe({
        sentAt: lambda + 600_000 - 2 * 60_000,
        remainingMs: 900_000,
        receivedAt: lambda + 600_000 + 200,
      }).stale,
    ).toBe(true)
  })

  test("a request beyond the acceptance window plus a minute's drift from the offset is stale, either way", () => {
    const clock = createLambdaClock()
    clock.observe({ sentAt: 0, remainingMs: 5_000, receivedAt: 100 })
    const at = (lag) =>
      clock.observe({
        sentAt: 1_000_000,
        remainingMs: 5_000,
        receivedAt: 1_000_000 + lag,
      })
    expect(at(100 + ACCEPT_WINDOW_MS + MAX_CLOCK_DRIFT_MS + 1).stale).toBe(true)
    expect(at(100 - MAX_CLOCK_DRIFT_MS - 1).stale).toBe(true)
    expect(
      at(100 + ACCEPT_WINDOW_MS + MAX_CLOCK_DRIFT_MS).stale,
    ).toBeUndefined()
  })

  test('the first request of a session is bounded by the clock difference AWS allows', () => {
    const fresh = () => createLambdaClock()
    const lag = (clock, ms) =>
      clock.observe({
        sentAt: 1_000_000,
        remainingMs: 5_000,
        receivedAt: 1_000_000 + ms,
      })
    expect(lag(fresh(), ACCEPT_WINDOW_MS + MAX_CLOCK_SKEW_MS + 1)).toEqual({
      ageMs: 0,
      deadline: null,
      stale: true,
    })
    expect(lag(fresh(), -MAX_CLOCK_SKEW_MS - 1).stale).toBe(true)
    // A machine clock 4 minutes ahead of Lambda connects; its first request cannot be told from
    // a late one and is refused, and the offset is learned from the next (see below).
    expect(lag(fresh(), 4 * 60_000)).toEqual({
      ageMs: 4 * 60_000,
      deadline: 1_000_000 + 5_000 - RETURN_TRIP_MS,
    })
    // A stale first request set no offset: the next one is the first trip.
    const clock = fresh()
    lag(clock, ACCEPT_WINDOW_MS + MAX_CLOCK_SKEW_MS + 1)
    expect(lag(clock, 300).ageMs).toBe(0)
  })

  describe('the first request of a session, before any trip is measured', () => {
    const LAMBDA = 10_000_000
    const at = (clock, { sent, lag, remainingMs = 10_000 }) =>
      clock.observe({ sentAt: sent, remainingMs, receivedAt: sent + lag })

    test('one delivered 22 s after it was sent, as after a frozen machine wakes up, is too old to run', () => {
      const first = at(createLambdaClock(), { sent: LAMBDA, lag: 22_000 })
      expect(first.ageMs).toBe(22_000)
      expect(first.deadline).toBeLessThan(LAMBDA + 22_000)
    })

    test('one 300 ms on its way runs, and sets the offset', () => {
      const clock = createLambdaClock()
      expect(at(clock, { sent: LAMBDA, lag: 300 })).toEqual({
        ageMs: 0,
        deadline: LAMBDA + 300 + 10_000 - RETURN_TRIP_MS,
      })
      expect(at(clock, { sent: LAMBDA + 5_000, lag: 500 }).ageMs).toBe(200)
    })

    test('one delivered 6 s after it was sent, as measured live after a 17 s freeze, is too old to run', () => {
      const first = at(createLambdaClock(), { sent: LAMBDA, lag: 6_000 })
      expect(first.ageMs).toBe(6_000)
      expect(first.ageMs).toBeGreaterThan(ACCEPT_WINDOW_MS)
    })

    test('a delay up to the allowance is taken as the trip, not as age', () => {
      const lag = FIRST_REQUEST_SKEW_MS
      expect(at(createLambdaClock(), { sent: LAMBDA, lag }).ageMs).toBe(0)
      expect(
        at(createLambdaClock(), { sent: LAMBDA, lag: lag + 1 }).ageMs,
      ).toBe(lag + 1)
    })

    test('a clock 20 s ahead: the first request is refused, the next one is measured against the offset it confirms', () => {
      const clock = createLambdaClock()
      const skew = 20_000
      expect(at(clock, { sent: LAMBDA, lag: skew + 150 }).ageMs).toBe(
        skew + 150,
      )
      const next = at(clock, { sent: LAMBDA + 4_000, lag: skew + 400 })
      expect(next).toEqual({
        ageMs: 250,
        deadline: LAMBDA + 4_000 + skew + 150 + 10_000 - RETURN_TRIP_MS,
      })
      expect(at(clock, { sent: LAMBDA + 9_000, lag: skew + 150 }).ageMs).toBe(0)
    })

    test('requests queued while the machine was frozen, delivered together, are all refused', () => {
      const clock = createLambdaClock()
      const thaw = LAMBDA + 30_000
      for (const sent of [LAMBDA + 8_000, LAMBDA + 10_000, LAMBDA + 10_400]) {
        const old = clock.observe({
          sentAt: sent,
          remainingMs: 10_000,
          receivedAt: thaw + (sent - LAMBDA) / 100,
        })
        expect(old.ageMs).toBeGreaterThan(ACCEPT_WINDOW_MS)
      }
      // The first request sent after the thaw runs.
      expect(
        clock.observe({
          sentAt: thaw + 2_000,
          remainingMs: 10_000,
          receivedAt: thaw + 2_000 + 200,
        }).ageMs,
      ).toBe(0)
    })

    test('an offset is confirmed only by a request that arrives a while later with the same delay', () => {
      const clock = createLambdaClock()
      at(clock, { sent: LAMBDA, lag: 20_000 })
      // Sent 1 s later, arriving less than OFFSET_CONFIRM_GAP_MS after the first: not confirmed.
      const soon = clock.observe({
        sentAt: LAMBDA + 1_000,
        remainingMs: 10_000,
        receivedAt: LAMBDA + 20_000 + OFFSET_CONFIRM_GAP_MS - 1,
      })
      expect(soon.ageMs).toBeGreaterThan(ACCEPT_WINDOW_MS)
      // A delay that differs by more than the trips can: not confirmed either.
      const other = at(clock, { sent: LAMBDA + 30_000, lag: 25_000 })
      expect(other.ageMs).toBe(25_000)
    })
  })
})
