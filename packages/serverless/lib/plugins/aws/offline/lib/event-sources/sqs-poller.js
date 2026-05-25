/**
 * SQS poller for sls offline.
 *
 * Wires `events: - sqs:` declarations to the in-memory queue store, so Lambda
 * handlers fire when a SendMessage lands in their target queue.
 *
 * Per-invocation Lambda context + environment building is delegated to the
 * shared `LambdaFunction` facade (see `lib/lambda/lambda-function.js`) — the
 * poller only constructs the SQS event envelope and dispatches the call.
 */

import { createHash } from 'node:crypto'
import ServerlessError from '../../../../../serverless-error.js'
import { FAKE_REGION } from '../constants.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the MD5 hex digest of a string — matches the md5OfBody field in
 * the SQS Lambda event envelope.
 *
 * @param {string} body
 * @returns {string}
 */
function md5(body) {
  return createHash('md5').update(body).digest('hex')
}

/**
 * Extracts the ARN string from an SQS event entry, handling both the canonical
 * object form `{ arn: '...' }` and the short string form `'arn:...'`.
 *
 * @param {string | { arn: string | object }} sqsEvent - The sqs key value from an event entry.
 * @returns {string}
 * @throws {ServerlessError} OFFLINE_SQS_UNRESOLVED_ARN if the ARN is a CFN intrinsic object.
 */
function extractArn(sqsEvent) {
  // Short form: sqs: 'arn:aws:sqs:...'
  if (typeof sqsEvent === 'string') {
    return sqsEvent
  }

  // Canonical form: sqs: { arn: '...' }
  const raw = sqsEvent.arn

  if (raw === undefined) {
    throw new ServerlessError(
      'SQS event entry has no "arn" field.',
      'OFFLINE_SQS_UNRESOLVED_ARN',
    )
  }

  if (typeof raw === 'object' && raw !== null) {
    throw new ServerlessError(
      'SQS event ARN is an unresolved CloudFormation intrinsic. ' +
        'Ensure intrinsics are resolved before starting the offline server.',
      'OFFLINE_SQS_UNRESOLVED_ARN',
    )
  }

  return raw
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts an SQS poller for every `events: - sqs:` declaration found in the
 * service's function definitions.
 *
 * @param {object} params
 * @param {object} params.serverless          - Framework's serverless instance.
 * @param {object} params.registry            - Resource registry (registry.sqs).
 * @param {object} params.store               - In-memory queue store.
 * @param {(functionKey: string) => { invoke(event: unknown): Promise<unknown> }} params.getLambdaFunction
 *        Lookup that returns a Lambda function facade for the given key.
 * @param {object} params.logger              - Logger (log.get('sls:offline:sqs-poller')).
 *
 * @returns {Promise<{
 *   stop(): Promise<void>,
 *   pollerCount: number,
 * }>} Controller object.
 *
 * @throws {ServerlessError} OFFLINE_SQS_UNRESOLVED_ARN       — intrinsic ARN.
 * @throws {ServerlessError} OFFLINE_SQS_QUEUE_NOT_PROVISIONED — unknown ARN.
 * @throws {ServerlessError} OFFLINE_SQS_DUPLICATE_CONSUMER   — two functions on same queue.
 */
export async function startSqsPollers({
  serverless,
  registry,
  store,
  getLambdaFunction,
  logger,
}) {
  const functions = serverless.service.functions ?? {}

  /** @type {(() => void)[]} */
  const unsubscribers = []

  /**
   * Track which queue ARNs have already been claimed (one consumer per queue).
   *
   * @type {Map<string, string>} ARN → function name
   */
  const claimedArns = new Map()

  for (const [fnName, fn] of Object.entries(functions)) {
    const events = fn.events ?? []

    for (const event of events) {
      if (!('sqs' in event)) {
        continue
      }

      // ── Resolve ARN ─────────────────────────────────────────────────────

      const arn = extractArn(event.sqs)

      // ── Duplicate consumer check ─────────────────────────────────────────

      if (claimedArns.has(arn)) {
        throw new ServerlessError(
          `SQS queue "${arn}" is already consumed by function "${claimedArns.get(arn)}". ` +
            `AWS only supports one Lambda consumer per queue; function "${fnName}" cannot also consume it.`,
          'OFFLINE_SQS_DUPLICATE_CONSUMER',
        )
      }

      // ── Lookup queue in registry ─────────────────────────────────────────

      let queueRecord
      for (const record of registry.sqs.values()) {
        if (record.arn === arn) {
          queueRecord = record
          break
        }
      }

      if (!queueRecord) {
        throw new ServerlessError(
          `SQS event source ARN "${arn}" is not provisioned. ` +
            'Ensure the queue is declared in the service resources.',
          'OFFLINE_SQS_QUEUE_NOT_PROVISIONED',
        )
      }

      claimedArns.set(arn, fnName)

      const { url: queueUrl } = queueRecord

      // ── Subscribe ────────────────────────────────────────────────────────
      // The subscriber callback is synchronous (the store notifies subscribers
      // synchronously on send). It builds the SQS event envelope and
      // dispatches the call via the shared Lambda function facade, which
      // resolves the handler path lazily and builds context + environment
      // uniformly with every other trigger source.

      const unsubscribe = store.subscribe(queueUrl, (messageRecord) => {
        // Dequeue the one message that just arrived.
        const [msg] = store.receive(queueUrl, 1)

        // Guard against an already-consumed race (shouldn't happen with
        // the synchronous store, but stays correct under future changes).
        if (!msg) return

        const now = Date.now()

        const sqsEvent = {
          Records: [
            {
              messageId: msg.messageId,
              receiptHandle: msg.receiptHandle,
              body: msg.body,
              attributes: {
                ApproximateReceiveCount: '1',
                SentTimestamp: String(now),
                SenderId: 'AIDAOFFLINE',
                ApproximateFirstReceiveTimestamp: String(now),
              },
              messageAttributes: msg.attributes ?? {},
              md5OfBody: md5(msg.body),
              eventSource: 'aws:sqs',
              eventSourceARN: arn,
              awsRegion: FAKE_REGION,
            },
          ],
        }

        getLambdaFunction(fnName)
          .invoke(sqsEvent)
          .catch((err) => {
            logger.error(
              `[sls:offline:sqs-poller] Invocation of "${fnName}" failed: ${err.message}`,
            )
          })
      })

      unsubscribers.push(unsubscribe)
      logger.info(
        `[sls:offline:sqs-poller] Polling queue "${queueUrl}" → ${fnName}`,
      )
    }
  }

  const pollerCount = unsubscribers.length
  let stopped = false

  return {
    pollerCount,

    /**
     * Stops all pollers by removing their queue subscriptions.
     * Safe to call multiple times.
     *
     * @returns {Promise<void>}
     */
    async stop() {
      if (stopped) return
      stopped = true
      for (const unsub of unsubscribers) {
        unsub()
      }
    },
  }
}
