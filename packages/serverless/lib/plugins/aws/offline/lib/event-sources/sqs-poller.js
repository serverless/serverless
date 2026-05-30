/**
 * SQS poller for sls offline.
 *
 * Wires `events: - sqs:` declarations to the in-memory queue store with
 * AWS-faithful event-source-mapping semantics:
 *
 *   receive a batch → invoke the Lambda once with all records → on success
 *   delete every received message; on a partial failure (the handler returns
 *   `batchItemFailures`) delete only the messages that did NOT fail, leaving the
 *   failures in flight so they redeliver (and eventually dead-letter); on a
 *   thrown/rejected invoke delete nothing so the whole batch redelivers.
 *
 * The poller wakes on the store's `subscribe` notification (fired by `send` and
 * by the visibility `sweep` when a queue becomes available again). A per-queue
 * in-flight flag serialises overlapping wakes so a single queue is never
 * processed by two concurrent batches; a `pending` re-arm makes the poller
 * drain again if a message arrived while a batch was in flight.
 *
 * Per-invocation Lambda context + environment building is delegated to the
 * shared `LambdaFunction` facade (see `lib/lambda/lambda-function.js`) — the
 * poller only constructs the SQS batch event envelope and dispatches the call.
 */

import { createHash } from 'node:crypto'
import ServerlessError from '../../../../../serverless-error.js'
import { FAKE_REGION } from '../constants.js'

/** AWS default ESM receive batch size when `batchSize` is not configured. */
const DEFAULT_BATCH_SIZE = 10

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

/**
 * Build the SQS batch-event record for a single received message.
 *
 * Mirrors the AWS SQS Lambda event-record shape: `attributes` carries the
 * system attributes the store stamps on receive (ApproximateReceiveCount,
 * SentTimestamp, SenderId, ApproximateFirstReceiveTimestamp, plus the FIFO
 * fields when present), `messageAttributes` carries the user attributes, and
 * `md5OfBody` is the digest of the raw body.
 *
 * @param {object} record - A record returned by `store.receive`.
 * @param {string} arn    - The queue ARN (becomes `eventSourceARN`).
 * @returns {object}
 */
function buildEventRecord(record, arn) {
  return {
    messageId: record.messageId,
    receiptHandle: record.receiptHandle,
    body: record.body,
    attributes: record.systemAttributes ?? {},
    messageAttributes: record.messageAttributes ?? {},
    md5OfBody: md5(record.body),
    eventSource: 'aws:sqs',
    eventSourceARN: arn,
    awsRegion: FAKE_REGION,
  }
}

/**
 * Normalise the set of failed messageIds reported by a Lambda result.
 *
 * AWS's ReportBatchItemFailures contract: a result object carrying a
 * `batchItemFailures` array of `{ itemIdentifier }` marks exactly those message
 * ids as failed; everything else in the batch succeeded. A non-object result
 * (or one without the array) means the whole batch succeeded.
 *
 * @param {unknown} result
 * @returns {Set<string> | null} the failed ids, or `null` when not a partial report.
 */
function failedIdsFromResult(result) {
  if (
    result === null ||
    typeof result !== 'object' ||
    !Array.isArray(result.batchItemFailures)
  ) {
    return null
  }
  const ids = new Set()
  for (const entry of result.batchItemFailures) {
    if (entry && entry.itemIdentifier !== undefined) {
      ids.add(String(entry.itemIdentifier))
    }
  }
  return ids
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

      // The configured batch size, capped to the AWS default of 10 when the
      // function does not declare `batchSize`.
      const batchSize = event.sqs?.batchSize ?? DEFAULT_BATCH_SIZE

      // The visibility timeout the receive should stamp on the batch — read
      // from the store so it reflects the queue's provisioned config (and any
      // runtime SetQueueAttributes change).
      function visibilityTimeout() {
        return store.getConfig(queueUrl)?.visibilityTimeout
      }

      // ── Drain loop ───────────────────────────────────────────────────────
      // `inFlight` serialises overlapping wakes so the same queue is never
      // processed by two concurrent batches. `pending` re-arms the loop when a
      // wake (send / sweep) lands while a batch is in flight, so freshly
      // arrived messages are drained without waiting for the next notify.
      let inFlight = false
      let pending = false

      function processBatch() {
        if (inFlight) {
          pending = true
          return
        }

        const records = store.receive(queueUrl, {
          max: batchSize,
          visibilityTimeout: visibilityTimeout(),
        })

        if (records.length === 0) return

        inFlight = true

        const sqsEvent = {
          Records: records.map((record) => buildEventRecord(record, arn)),
        }

        // Snapshot the receipt handles by messageId so deletes survive any
        // store mutation during the (async) invoke.
        const handlesById = new Map(
          records.map((record) => [record.messageId, record.receiptHandle]),
        )

        Promise.resolve(getLambdaFunction(fnName).invoke(sqsEvent))
          .then((result) => {
            const failedIds = failedIdsFromResult(result)
            for (const [messageId, receiptHandle] of handlesById) {
              // Partial-failure report: keep the failures in flight so they
              // redeliver (→ DLQ once maxReceiveCount is exceeded). No report:
              // the whole batch succeeded, so delete every message.
              if (failedIds && failedIds.has(messageId)) continue
              store.deleteMessage(queueUrl, receiptHandle)
            }
          })
          .catch((err) => {
            // A thrown/rejected invoke deletes nothing: the whole batch stays
            // in flight and redelivers when its visibility window lapses.
            logger.error(
              `[sls:offline:sqs-poller] Invocation of "${fnName}" failed: ${err.message}`,
            )
          })
          .finally(() => {
            inFlight = false
            // Drain again if a wake arrived while this batch was in flight, or
            // if the batch was full (more may be waiting).
            if (pending || records.length === batchSize) {
              pending = false
              processBatch()
            }
          })
      }

      const unsubscribe = store.subscribe(queueUrl, () => {
        processBatch()
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
