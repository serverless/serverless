/**
 * A clock and timers a test moves by hand. `advance` runs the timers that fall due in order and,
 * after each, lets the event loop turn a few times, so work a timer starts (promises, fakes that
 * answer on setImmediate) finishes before the clock jumps to the next timer, as it would in real
 * time. `live()` counts timeouts not yet run or cleared and intervals not yet cleared, so a test
 * can assert that a module left none behind.
 */
export const manualClock = (start = 0) => {
  let time = start
  let next = 0
  const due = new Map()
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  const add = (fn, ms, every) => {
    next += 1
    due.set(next, { fn, at: time + Math.max(0, ms ?? 0), every })
    return next
  }
  const clear = (handle) => {
    due.delete(handle)
  }
  const flush = async (turns = 5) => {
    for (let i = 0; i < turns; i++) await settle()
  }
  return {
    now: () => time,
    timers: {
      setTimeout: (fn, ms) => add(fn, ms),
      clearTimeout: clear,
      setInterval: (fn, ms) => add(fn, ms, Math.max(1, ms)),
      clearInterval: clear,
    },
    live: () => due.size,
    /** How long until each live timeout (intervals left out) fires, soonest first. */
    timeouts: () =>
      [...due.values()]
        .filter(({ every }) => !every)
        .map(({ at }) => at - time)
        .sort((a, b) => a - b),
    settle,
    /** Settles promises for a few turns of the event loop. */
    flush,
    async advance(ms) {
      const end = time + ms
      for (;;) {
        const [handle, timer] =
          [...due.entries()].sort((a, b) => a[1].at - b[1].at)[0] ?? []
        if (!timer || timer.at > end) break
        time = timer.at
        if (timer.every) timer.at += timer.every
        else due.delete(handle)
        timer.fn()
        await flush()
      }
      time = end
      await settle()
    },
  }
}
