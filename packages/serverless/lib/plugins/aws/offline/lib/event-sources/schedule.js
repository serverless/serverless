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

import { Cron } from 'croner'

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
    // AWS EventBridge accepts 6-field cron (min hour dom month dow year).
    // Croner's 6-field form is (sec min hour dom month dow) — incompatible.
    // Translate by dropping the AWS year field; the remaining 5 fields are
    // POSIX-cron-shaped, which croner accepts directly. 5-field input
    // passes through unchanged.
    const fields = inner.split(/\s+/)
    if (fields.length < 5 || fields.length > 6) {
      throw _invalid(expr)
    }
    const cronerExpression =
      fields.length === 6 ? fields.slice(0, 5).join(' ') : inner
    return { kind: 'cron', expression: cronerExpression }
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

/**
 * In-process scheduler factory.
 *
 * Walks the service's functions at construction, validates each `schedule:`
 * declaration (rate or cron), and prepares a paused timer per entry. Timers
 * are armed in `start()` and torn down in `stop()`. Each tick synthesizes
 * an AWS-shaped Scheduled Event envelope (or uses the explicit `input`
 * verbatim) and dispatches it through the shared Lambda facade.
 *
 * Boot-time validation is strict — both invalid rate strings and invalid
 * cron patterns surface as `OFFLINE_SCHEDULE_INVALID_EXPRESSION` BEFORE
 * `start()` is called, so a typo can't lurk until the first tick.
 *
 * @param {object} params
 * @param {object} params.serverless                Framework's serverless instance.
 * @param {(functionKey: string) => { invoke(event: unknown): Promise<unknown> }} params.getLambdaFunction
 *        Lookup that returns a Lambda function facade for the given key.
 * @param {object} params.logger                    Logger (log.get('sls:offline:scheduler')).
 * @param {string} params.region                    provider.region ?? FAKE_REGION.
 * @returns {{
 *   start(): void,
 *   stop(): Promise<void>,
 *   scheduledCount: number,
 *   disabledCount: number,
 * }}
 * @throws {ServerlessError} OFFLINE_SCHEDULE_INVALID_EXPRESSION for any
 *   invalid rate or cron expression.
 */
export function createScheduler({
  serverless,
  getLambdaFunction,
  logger,
  region,
}) {
  /**
   * @typedef {{
   *   functionKey: string,
   *   index: number,
   *   hasInput: boolean,
   *   input?: unknown,
   *   parsed: ReturnType<typeof parseExpression>,
   *   cron?: import('croner').Cron,
   *   intervalId?: NodeJS.Timeout,
   *   armed: boolean,
   * }} Entry
   */

  /** @type {Entry[]} */
  const entries = []
  let scheduledCount = 0
  let disabledCount = 0

  // Per-entry in-flight invocation counter, keyed by `${functionKey}#${index}`.
  // Persists across the lifetime of the scheduler instance — a fresh
  // createScheduler() call gives a fresh map. Observational only; ticks are
  // never serialized (real AWS doesn't either), but we warn when a tick fires
  // before the previous invocation has settled.
  /** @type {Map<string, number>} */
  const inFlight = new Map()

  const functions = serverless.service.functions ?? {}

  for (const [functionKey, fn] of Object.entries(functions)) {
    const events = fn.events ?? []
    for (let index = 0; index < events.length; index++) {
      const event = events[index]
      if (!event || !('schedule' in event)) continue

      const raw = event.schedule
      /** @type {{ rate: string | string[], enabled?: boolean, input?: unknown }} */
      const def = typeof raw === 'string' ? { rate: raw } : { ...raw }
      const enabled = def.enabled !== false
      const rates = Array.isArray(def.rate) ? def.rate : [def.rate]

      for (const rateExpr of rates) {
        scheduledCount++

        // Validate-always: parse (and for cron, attempt croner construction)
        // even when enabled:false so a typo throws at boot regardless of the
        // flag. We just don't push the entry or arm a timer in that branch —
        // flipping enabled later shouldn't surface a latent syntax error.
        const parsed = parseExpression(rateExpr)

        /** @type {Entry} */
        const entry = {
          functionKey,
          index,
          // Capture presence of `input` so literal-null user input
          // (`input: null`) is delivered verbatim rather than swallowed by
          // a truthiness check.
          hasInput: 'input' in def,
          input: def.input,
          parsed,
          armed: false,
        }

        if (parsed.kind === 'cron') {
          try {
            entry.cron = new Cron(
              parsed.expression,
              { timezone: 'UTC', paused: true },
              () => _onTick(entry),
            )
          } catch (err) {
            throw new ServerlessError(
              `Invalid cron pattern in "${rateExpr}": ${err.message}`,
              'OFFLINE_SCHEDULE_INVALID_EXPRESSION',
            )
          }
        }

        if (!enabled) {
          disabledCount++
          // Discard the validated entry; release the croner timer so it
          // doesn't sit paused-but-allocated.
          if (entry.cron !== undefined) entry.cron.stop()
          logger.notice(
            `Schedule for ${functionKey} #${index} disabled by enabled:false`,
          )
          continue
        }

        entries.push(entry)
      }
    }
  }

  function _onTick(entry) {
    // Branch on presence (not truthiness): if the user wrote
    // `input: null` they want literal JSON null delivered verbatim, not
    // the synthesized envelope.
    const event = entry.hasInput
      ? entry.input
      : buildScheduledEvent({
          functionKey: entry.functionKey,
          index: entry.index,
          region,
          time: new Date(),
        })

    const key = `${entry.functionKey}#${entry.index}`
    const inFlightCount = inFlight.get(key) ?? 0
    if (inFlightCount > 0) {
      logger.warning(
        `[sls:offline:scheduler] Schedule overlap: ${entry.functionKey} ` +
          `tick fired while ${inFlightCount} invocation(s) still in-flight`,
      )
    }
    inFlight.set(key, inFlightCount + 1)

    // Fire-and-forget — real AWS does not serialize ticks.
    getLambdaFunction(entry.functionKey)
      .invoke(event)
      .catch((err) => {
        logger.error(
          `[sls:offline:scheduler] Invocation of "${entry.functionKey}" failed: ${err.message}`,
        )
      })
      .finally(() => {
        // Decrement on BOTH success and failure so a single hung invocation
        // doesn't latch the counter past its lifetime.
        inFlight.set(key, (inFlight.get(key) ?? 1) - 1)
      })
  }

  return {
    get scheduledCount() {
      return scheduledCount
    },
    get disabledCount() {
      return disabledCount
    },

    start() {
      for (const entry of entries) {
        if (entry.armed) continue
        if (entry.parsed.kind === 'cron') {
          entry.cron.resume()
        } else {
          entry.intervalId = setInterval(
            () => _onTick(entry),
            entry.parsed.intervalMs,
          )
        }
        entry.armed = true
      }
    },

    async stop() {
      for (const entry of entries) {
        if (!entry.armed) continue
        if (entry.parsed.kind === 'cron') {
          entry.cron.stop()
        } else if (entry.intervalId !== undefined) {
          clearInterval(entry.intervalId)
          entry.intervalId = undefined
        }
        entry.armed = false
      }
    },
  }
}
