/**
 * Durations on the command line: a whole number of seconds, minutes or hours ("100s", "5m",
 * "1h"), a bare whole number of seconds ("100"), and "0" where an option can turn something off.
 * One module for every Dev Mode option that takes a duration (`dev stop --timeout`,
 * `dev wait --timeout`, `dev --idle-timeout`).
 */
import { ServerlessError } from '@serverless/util'

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 }
// No unit is seconds.
const DURATION = /^(\d{1,7})([smh]?)$/
// The longest wait a timer can hold is 2,147,483,647 ms; a longer one fires at once. Every
// duration stays within the whole hours below it (596h), whatever the option allows.
const TIMER_MAX_MS = 2_147_483_647
const LONGEST_MS = Math.floor(TIMER_MAX_MS / UNIT_MS.h) * UNIT_MS.h

/** `ms` in its largest whole unit: 100s, 5m, 1h. */
export const durationText = (ms) => {
  if (ms % UNIT_MS.h === 0) return `${ms / UNIT_MS.h}h`
  if (ms % UNIT_MS.m === 0) return `${ms / UNIT_MS.m}m`
  return `${Math.round(ms / 1000)}s`
}

/** `text` in milliseconds. `allowZero` lets "0" (or "0s") mean "off". */
export const parseDuration = (
  text,
  { option, allowZero = false, maxMs = Infinity } = {},
) => {
  const invalid = () =>
    new ServerlessError(
      `Option "--${option}" takes a duration such as 100 or 100s (seconds), 5m or 1h${allowZero ? ', or 0 to turn it off' : ''}.`,
      'DEV_MODE_INVALID_DURATION',
      { stack: false },
    )
  const match = DURATION.exec(String(text ?? '').trim())
  if (!match) throw invalid()
  const ms = Number(match[1]) * UNIT_MS[match[2] || 's']
  if (ms === 0) {
    if (allowZero) return 0
    throw invalid()
  }
  const longest = Math.min(maxMs, LONGEST_MS)
  if (ms > longest) {
    throw new ServerlessError(
      `Option "--${option}" can be at most ${durationText(longest)}.`,
      'DEV_MODE_INVALID_DURATION',
      { stack: false },
    )
  }
  return ms
}
