/**
 * S3 → Lambda event notifications for sls offline.
 *
 * Translates a bucket-store mutation (the `{ bucket, key, eventName, size,
 * etag, sequencer }` payload the store emits after a successful put / copy /
 * complete / delete) into the AWS S3 event-notification envelope and invokes
 * every `events: - s3` function whose configuration matches the mutation.
 *
 * Matching is three-fold and all parts must hold:
 *  1. the config's `bucket` equals the mutation's bucket,
 *  2. the config's `event` (an `s3:`-prefixed type or glob such as
 *     `s3:ObjectCreated:*`) matches the store's `eventName`, and
 *  3. every filter rule (`prefix` / `suffix`) holds against the raw key.
 *
 * Invocations are fire-and-forget — the store mutation that triggered the
 * notification has already committed, so a handler failure is logged but never
 * propagated back into the data path.
 */

import { randomUUID } from 'node:crypto'

/** Principal id S3 stamps on offline-generated events (placeholder identity). */
const OFFLINE_PRINCIPAL = 'AIDAOFFLINE'

/** Source IP echoed in every offline S3 event. */
const OFFLINE_SOURCE_IP = '127.0.0.1'

/**
 * Whether a store `eventName` (e.g. `ObjectCreated:Put`) satisfies a configured
 * `events: - s3` event type. The config value is `s3:`-prefixed; a trailing
 * `*` after the category (`ObjectCreated:*`) matches any action in that
 * category, otherwise the match is exact.
 *
 * @param {string} configEvent - the `s3:`-prefixed config event (e.g. `s3:ObjectCreated:*`).
 * @param {string} storeEventName - the store event name (e.g. `ObjectCreated:Put`).
 * @returns {boolean}
 */
function eventMatches(configEvent, storeEventName) {
  // Strip the `s3:` prefix the config carries; the store name has none.
  const pattern = String(configEvent).replace(/^s3:/, '')

  if (pattern.endsWith(':*')) {
    const category = pattern.slice(0, -1) // keep the trailing ':' (e.g. 'ObjectCreated:')
    return storeEventName.startsWith(category)
  }

  return pattern === storeEventName
}

/**
 * Whether a key satisfies every filter rule. A `prefix` rule requires the key
 * to start with its value; a `suffix` rule requires it to end with its value.
 * An empty rule set always matches.
 *
 * @param {{ prefix?: string, suffix?: string }[]} rules
 * @param {string} key
 * @returns {boolean}
 */
function rulesMatch(rules, key) {
  for (const rule of rules ?? []) {
    if (rule.prefix !== undefined && !key.startsWith(rule.prefix)) return false
    if (rule.suffix !== undefined && !key.endsWith(rule.suffix)) return false
  }
  return true
}

/**
 * URL-encode an object key the way the S3 event notification does: percent
 * encoding with spaces rendered as `+`, while the path separator `/` is kept
 * literal.
 *
 * @param {string} key
 * @returns {string}
 */
function encodeEventKey(key) {
  return encodeURIComponent(key).replace(/%20/g, '+').replace(/%2F/g, '/')
}

/**
 * Build the S3 event-notification envelope for a single mutation + matching
 * config.
 *
 * @param {object} params
 * @param {{ functionKey: string }} params.config
 * @param {{ bucket: string, key: string, eventName: string, size: number, etag: string, sequencer: string }} params.mutation
 * @param {string} params.region
 * @param {() => number} params.now
 * @returns {object} The `{ Records: [...] }` event.
 */
function buildEvent({ config, mutation, region, now }) {
  const requestId = randomUUID()
  // The store stores etags quoted (`"<hex>"`); the event carries them unquoted.
  const eTag = String(mutation.etag).replace(/^"|"$/g, '')

  return {
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: region,
        eventTime: new Date(now()).toISOString(),
        eventName: mutation.eventName,
        userIdentity: { principalId: OFFLINE_PRINCIPAL },
        requestParameters: { sourceIPAddress: OFFLINE_SOURCE_IP },
        responseElements: {
          'x-amz-request-id': requestId,
          'x-amz-id-2': requestId,
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: config.functionKey,
          bucket: {
            name: mutation.bucket,
            ownerIdentity: { principalId: OFFLINE_PRINCIPAL },
            arn: `arn:aws:s3:::${mutation.bucket}`,
          },
          object: {
            key: encodeEventKey(mutation.key),
            size: mutation.size,
            eTag,
            sequencer: mutation.sequencer,
          },
        },
      },
    ],
  }
}

/**
 * Create the S3 notifier. The returned `notify` is meant to be wired (directly
 * or via a wiring fan-out) as the bucket store's `onMutation` callback.
 *
 * @param {object} params
 * @param {{ functionKey: string, bucket: string, event: string, rules: object[] }[]} params.configs
 * @param {(functionKey: string) => { invoke(event: unknown): Promise<unknown> }} params.getLambdaFunction
 * @param {{ error: Function }} params.logger
 * @param {() => number} [params.now]
 * @param {string} params.region
 * @returns {{ notify(mutation: object): void }}
 */
export function createS3Notifier({
  configs,
  getLambdaFunction,
  logger,
  now = () => Date.now(),
  region,
}) {
  /**
   * Match a single store mutation against the configured notifications and
   * fire-and-forget an invoke for each match.
   *
   * @param {{ bucket: string, key: string, eventName: string, size: number, etag: string, sequencer: string }} mutation
   * @returns {void}
   */
  function notify(mutation) {
    for (const config of configs) {
      if (config.bucket !== mutation.bucket) continue
      if (!eventMatches(config.event, mutation.eventName)) continue
      if (!rulesMatch(config.rules, mutation.key)) continue

      const event = buildEvent({ config, mutation, region, now })
      // Fire-and-forget: the mutation has already committed, so a failed
      // handler is logged but never bubbles into the store's data path. S3
      // notifications are asynchronous invocations, so `{ async: true }` opts
      // the function into onSuccess/onFailure destination routing.
      Promise.resolve(
        getLambdaFunction(config.functionKey).invoke(event, { async: true }),
      ).catch((err) => {
        logger.error(
          `[sls:offline:s3] Notification invoke of "${config.functionKey}" for ` +
            `s3://${mutation.bucket}/${mutation.key} failed: ${err.message}`,
        )
      })
    }
  }

  return { notify }
}
