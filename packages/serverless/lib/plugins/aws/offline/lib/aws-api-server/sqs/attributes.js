/**
 * Derive the local queue-store configuration from a lifted `AWS::SQS::Queue`
 * resource's `Properties`.
 *
 * Property values may arrive either typed (numbers, booleans) or as strings —
 * CloudFormation, template authors, and intrinsic resolution all produce
 * stringly-typed values in practice — so every field is coerced defensively.
 *
 * The returned `redrive` carries the dead-letter target's ARN (`dlqArn`), not a
 * resolved URL: arn → url resolution happens later, at boot wiring, against the
 * resource registry.
 */

/** Documented defaults (seconds, except booleans). */
const DEFAULT_VISIBILITY_TIMEOUT = 30
const DEFAULT_DELAY_SECONDS = 0
const DEFAULT_MESSAGE_RETENTION_PERIOD = 345_600
const DEFAULT_RECEIVE_WAIT_TIME = 0

/**
 * Coerce a value to a finite number, falling back to `fallback` when the value
 * is missing or non-numeric.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Coerce a value to a boolean, treating the string `'true'` as true and
 * everything else (including `'false'`) by its truthiness / explicit value.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return Boolean(value)
}

/**
 * Parse a `RedrivePolicy` property — accepted as a JSON string or an object —
 * into `{ dlqArn, maxReceiveCount }`. Returns `null` when absent, unparseable,
 * or missing a dead-letter target ARN.
 *
 * @param {unknown} raw
 * @returns {{ dlqArn: string, maxReceiveCount: number } | null}
 */
function parseRedrivePolicy(raw) {
  if (raw === undefined || raw === null) return null

  let policy = raw
  if (typeof raw === 'string') {
    try {
      policy = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (typeof policy !== 'object' || policy === null) return null

  const dlqArn = policy.deadLetterTargetArn
  if (typeof dlqArn !== 'string' || dlqArn.length === 0) return null

  return {
    dlqArn,
    maxReceiveCount: toNumber(policy.maxReceiveCount, 0),
  }
}

/**
 * Build the queue-store config from a resource's `Properties`.
 *
 * @param {object} [properties]
 * @returns {{
 *   visibilityTimeout: number,
 *   delaySeconds: number,
 *   messageRetentionPeriod: number,
 *   receiveWaitTime: number,
 *   fifo: boolean,
 *   contentBasedDedup: boolean,
 *   redrive: { dlqArn: string, maxReceiveCount: number } | null,
 * }}
 */
export function parseQueueConfig(properties = {}) {
  const props = properties ?? {}

  return {
    visibilityTimeout: toNumber(
      props.VisibilityTimeout,
      DEFAULT_VISIBILITY_TIMEOUT,
    ),
    delaySeconds: toNumber(props.DelaySeconds, DEFAULT_DELAY_SECONDS),
    messageRetentionPeriod: toNumber(
      props.MessageRetentionPeriod,
      DEFAULT_MESSAGE_RETENTION_PERIOD,
    ),
    receiveWaitTime: toNumber(
      props.ReceiveMessageWaitTimeSeconds,
      DEFAULT_RECEIVE_WAIT_TIME,
    ),
    fifo: toBoolean(props.FifoQueue),
    contentBasedDedup: toBoolean(props.ContentBasedDeduplication),
    redrive: parseRedrivePolicy(props.RedrivePolicy),
  }
}
