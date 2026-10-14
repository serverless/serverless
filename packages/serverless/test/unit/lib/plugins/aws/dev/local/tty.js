// Shared by the hotkey tests: a terminal's stdin, and a wait for a condition.
import { PassThrough } from 'stream'

/** A terminal's stdin: a stream that reports raw mode, and every mode it was set to. */
export const fakeTty = () =>
  Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    modes: [],
    setRawMode(on) {
      this.isRaw = on
      this.modes.push(on)
      return this
    },
  })

/** Resolves once `condition()` holds. */
export const until = async (condition) => {
  while (!condition()) await new Promise((resolve) => setImmediate(resolve))
}
