/**
 * SQS poller for sls offline.
 *
 * Wires `events: - sqs:` declarations to the in-memory queue store, so Lambda
 * handlers fire when a SendMessage lands in their target queue.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import ServerlessError from '../../../../../serverless-error.js'
import { FAKE_REGION } from '../constants.js'
import { getHandlerBaseDir } from '../handler-base-dir.js'

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
 * Resolves a handler string of the form `<rel-path>.<exportName>` to an
 * absolute file path and the exported function name.
 *
 * Tries extensions `.js`, `.mjs`, `.cjs` in that order and returns the first
 * that exists on disk.
 *
 * @param {string} handlerString - e.g. `'src/handler.main'`
 * @param {string} serviceDir    - Absolute path to the service root.
 * @returns {Promise<{ handlerPath: string, handlerName: string }>}
 */
async function resolveHandler(handlerString, serviceDir) {
  const lastDot = handlerString.lastIndexOf('.')
  const relPath = handlerString.slice(0, lastDot)
  const handlerName = handlerString.slice(lastDot + 1)

  const extensions = ['.js', '.mjs', '.cjs']
  for (const ext of extensions) {
    const handlerPath = resolve(join(serviceDir, relPath + ext))
    try {
      await access(handlerPath)
      return { handlerPath, handlerName }
    } catch {
      // File does not exist; try next extension.
    }
  }

  // No matching file found — return the .js path and let the runner surface
  // the error at invocation time (avoids blocking startup).
  return {
    handlerPath: resolve(join(serviceDir, relPath + '.js')),
    handlerName,
  }
}

/**
 * Synchronous variant of `resolveHandler`. Used inside the queue subscriber
 * callback, which must remain synchronous so that the store's synchronous
 * notification contract is preserved and tests can assert immediately after
 * `store.send()`.
 *
 * Uses `fs.accessSync` instead of the promise-based `fs.access`.
 *
 * @param {string} handlerString - e.g. `'src/handler.main'`
 * @param {string} serviceDir    - Absolute path to the service root.
 * @returns {{ handlerPath: string, handlerName: string }}
 */
function resolveHandlerSync(handlerString, serviceDir) {
  const lastDot = handlerString.lastIndexOf('.')
  const relPath = handlerString.slice(0, lastDot)
  const handlerName = handlerString.slice(lastDot + 1)

  const extensions = ['.js', '.mjs', '.cjs']
  for (const ext of extensions) {
    const handlerPath = resolve(join(serviceDir, relPath + ext))
    try {
      fs.accessSync(handlerPath, fs.constants.F_OK)
      return { handlerPath, handlerName }
    } catch {
      // File does not exist; try next extension.
    }
  }

  // No matching file found — return the .js path and let the runner surface
  // the error at invocation time (avoids blocking startup).
  return {
    handlerPath: resolve(join(serviceDir, relPath + '.js')),
    handlerName,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts an SQS poller for every `events: - sqs:` declaration found in the
 * service's function definitions.
 *
 * @param {object} params
 * @param {object} params.serverless - Framework's serverless instance.
 * @param {object} params.registry  - Resource registry (registry.sqs).
 * @param {object} params.store     - In-memory queue store.
 * @param {object} params.runner    - Worker-thread runner instance.
 * @param {object} params.logger    - Logger (log.get('sls:offline:sqs-poller')).
 *
 * @returns {Promise<{
 *   stop(): Promise<void>,
 *   pollerCount: number,
 * }>} Controller object.
 *
 * @throws {ServerlessError} OFFLINE_SQS_UNRESOLVED_ARN      — intrinsic ARN.
 * @throws {ServerlessError} OFFLINE_SQS_QUEUE_NOT_PROVISIONED — unknown ARN.
 * @throws {ServerlessError} OFFLINE_SQS_DUPLICATE_CONSUMER   — two functions on same queue.
 */
export async function startSqsPollers({
  serverless,
  registry,
  store,
  runner,
  logger,
}) {
  const functions = serverless.service.functions ?? {}
  const providerEnv = serverless.service.provider?.environment ?? {}

  // getHandlerBaseDir() is called lazily inside the subscriber callback (not
  // captured here) so that bundler plugins (built-in esbuild or community
  // serverless-esbuild) that modify servicePath / custom location during
  // before:offline:start are reflected when the first message arrives.

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

      // ── Build environment ────────────────────────────────────────────────

      const environment = {
        ...providerEnv,
        ...(fn.environment ?? {}),
        AWS_REGION: FAKE_REGION,
        AWS_DEFAULT_REGION: FAKE_REGION,
        AWS_LAMBDA_FUNCTION_NAME: fnName,
        IS_OFFLINE: 'true',
      }

      // ── Timeout ──────────────────────────────────────────────────────────

      const timeoutMs = (fn.timeout ?? 6) * 1000

      // ── Subscribe ────────────────────────────────────────────────────────
      // Handler path resolution is intentionally lazy (inside the callback)
      // so that bundler plugins which swap serverless.config.servicePath in
      // their before:offline:start hook are reflected when the first SQS
      // message arrives, rather than being pinned to the source directory at
      // poller-setup time.

      const unsubscribe = store.subscribe(queueUrl, (messageRecord) => {
        // Dequeue the one message that just arrived.
        const [msg] = store.receive(queueUrl, 1)

        // The message may have already been consumed by a race (shouldn't
        // happen with synchronous store, but guard anyway).
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

        const context = {
          functionName: fnName,
          awsRequestId: `offline-${Date.now()}`,
          invokedFunctionArn: `arn:aws:lambda:${FAKE_REGION}:000000000000:function:${fnName}`,
          // Send a numeric deadline instead of a function — functions cannot be
          // transferred via structured-clone (workerData). The worker entry
          // inflates this into getRemainingTimeInMillis().
          deadlineMs: Date.now() + timeoutMs,
          callbackWaitsForEmptyEventLoop: true,
          // Pass through memorySize so the worker can set memoryLimitInMB and
          // the corresponding AWS_LAMBDA_FUNCTION_MEMORY_SIZE env var correctly.
          memoryLimitInMB: fn.memorySize ?? 1024,
          // Pass the raw handler string so the worker can set process.env._HANDLER
          // for parity with the real Lambda execution environment.
          handler: fn.handler,
        }

        // Read the handler base directory lazily each time a message arrives
        // so that bundler-swapped paths (built-in esbuild) and community
        // serverless-esbuild custom locations set during before:offline:start
        // are both reflected correctly.
        // Use the synchronous resolver so that runner.invoke() is called
        // within the same synchronous turn — this preserves the store's
        // synchronous notification contract.
        const { handlerPath, handlerName } = resolveHandlerSync(
          fn.handler,
          getHandlerBaseDir(serverless),
        )

        runner
          .invoke({
            functionKey: fnName,
            handlerPath,
            handlerName,
            event: sqsEvent,
            context,
            environment,
            timeoutMs,
          })
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
