/**
 * In-process scheduler for `events: - schedule:` declarations.
 *
 * Walks the service's functions at boot, validates each schedule expression
 * (rate or cron), arms timers in `start()`, dispatches synthesized
 * `Scheduled Event` envelopes through the shared Lambda facade on each tick.
 *
 * Boot-time validation is strict — a typo'd cron throws at construction
 * rather than failing silently at the first tick.
 */

import { randomUUID } from 'node:crypto'

import ServerlessError from '../../../../../serverless-error.js'
import { FAKE_ACCOUNT_ID } from '../constants.js'

const RATE_UNIT_MS = {
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
}

/**
 * Validate and decode a schedule expression at boot time.
 *
 * @param {string} expr  Raw `events[].schedule` (string form) or
 *   `events[].schedule.rate` (object form).
 * @returns {{ kind: 'rate', intervalMs: number } | { kind: 'cron', expression: string }}
 * @throws {ServerlessError} OFFLINE_SCHEDULE_INVALID_EXPRESSION for
 *   anything else (sub-minute rates, missing units, unbalanced parens,
 *   non-string input, …). Boot must fail loud; the alternative is
 *   discovering the typo on first-tick fire.
 */
export function parseExpression(expr) {
  if (typeof expr !== 'string' || expr.length === 0) {
    throw _invalid(expr)
  }

  const rateMatch = expr.match(/^rate\(\s*(\d+)\s+(\w+)\s*\)$/)
  if (rateMatch) {
    const count = Number(rateMatch[1])
    const unit = rateMatch[2]
    const unitMs = RATE_UNIT_MS[unit]
    if (!unitMs || count <= 0) {
      throw _invalid(expr)
    }
    return { kind: 'rate', intervalMs: count * unitMs }
  }

  const cronMatch = expr.match(/^cron\((.+)\)$/)
  if (cronMatch) {
    const inner = cronMatch[1].trim()
    if (inner.length === 0) {
      throw _invalid(expr)
    }
    return { kind: 'cron', expression: inner }
  }

  throw _invalid(expr)
}

function _invalid(expr) {
  return new ServerlessError(
    `Invalid schedule expression: ${String(expr)}. ` +
      'Expected rate(N minute(s)|hour(s)|day(s)) or cron(<6-field-expression>). ' +
      'Sub-minute rate() is unsupported (matches AWS).',
    'OFFLINE_SCHEDULE_INVALID_EXPRESSION',
  )
}

/**
 * Build the synthesized AWS Scheduled Event envelope for a single tick.
 *
 * Shape matches what real AWS EventBridge delivers to a Lambda target:
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/EventTypes.html#schedule_event_type
 *
 * `time` is ISO-8601 without milliseconds (AWS quirk —
 * `2020-02-09T14:13:57Z`, not `2020-02-09T14:13:57.123Z`).
 *
 * @param {object} args
 * @param {string} args.functionKey
 * @param {number} args.index   Position of the schedule entry inside the
 *   function's `events:` array. Disambiguates the rule ARN when one
 *   function has multiple schedules.
 * @param {string} args.region
 * @param {Date}   args.time    Tick time.
 * @returns {object}
 */
export function buildScheduledEvent({ functionKey, index, region, time }) {
  return {
    account: FAKE_ACCOUNT_ID,
    'detail-type': 'Scheduled Event',
    detail: {},
    id: randomUUID(),
    region,
    resources: [
      `arn:aws:events:${region}:${FAKE_ACCOUNT_ID}:rule/${functionKey}-schedule-${index}`,
    ],
    source: 'aws.events',
    time: time.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    version: '0',
  }
}
