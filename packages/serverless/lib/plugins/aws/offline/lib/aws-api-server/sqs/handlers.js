/**
 * Hapi route handler factory for SQS — offline spike surface (D-5).
 *
 * Supports the two operations needed for the spike:
 *   - AmazonSQS.SendMessage
 *   - AmazonSQS.ReceiveMessage
 *
 * SDK v3 sends SQS requests using the JSON-RPC protocol with:
 *   - Content-Type: application/x-amz-json-1.0
 *   - X-Amz-Target: AmazonSQS.<Action>
 *   - Body: JSON with fields such as QueueUrl, MessageBody, etc.
 */

import { createHash } from 'node:crypto'
import { allSqsQueues } from '../../provisioner/registry.js'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Produce an AWS-shaped JSON error response in the Hapi response toolkit.
 *
 * @param {object} h           - Hapi response toolkit.
 * @param {number} statusCode  - HTTP status code.
 * @param {string} errorCode   - AWS error code (e.g. `'AWS.SimpleQueueService.NonExistentQueue'`).
 * @param {string} message     - Human-readable error message.
 * @returns {object} A Hapi response object.
 */
function errorResponse(h, statusCode, errorCode, message) {
  return h
    .response({
      __type: errorCode,
      Message: message,
    })
    .code(statusCode)
    .type('application/x-amz-json-1.0')
}

/**
 * Compute the MD5 hex digest of a UTF-8 string — matches the value AWS
 * returns in `MD5OfMessageBody` / `MD5OfBody`.
 *
 * @param {string} str
 * @returns {string} Lower-case hex MD5.
 */
function md5(str) {
  return createHash('md5').update(str, 'utf8').digest('hex')
}

// ---------------------------------------------------------------------------
// Per-action handlers
// ---------------------------------------------------------------------------

/**
 * Handle `AmazonSQS.SendMessage`.
 *
 * Validates that `MessageBody` is present, enqueues the message, and
 * returns the AWS-shaped acknowledgement.
 *
 * @param {object} body      - Parsed JSON request body.
 * @param {string} queueUrl  - The resolved queue URL.
 * @param {object} store     - The in-memory queue store.
 * @param {object} h         - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
function handleSendMessage(body, queueUrl, store, h) {
  if (!body.MessageBody) {
    return errorResponse(
      h,
      400,
      'AWS.SimpleQueueService.InvalidParameterValue',
      'MessageBody is required.',
    )
  }

  const { messageId } = store.send(
    queueUrl,
    body.MessageBody,
    body.MessageAttributes ?? {},
  )

  return h
    .response({
      MD5OfMessageBody: md5(body.MessageBody),
      MessageId: messageId,
    })
    .code(200)
    .type('application/x-amz-json-1.0')
}

/**
 * Handle `AmazonSQS.ReceiveMessage`.
 *
 * Dequeues up to `MaxNumberOfMessages` messages (default 1, clamped to 10)
 * and returns them in AWS format. When the queue is empty the `Messages` key
 * is omitted from the response body, matching real SQS behaviour.
 *
 * @param {object} body      - Parsed JSON request body.
 * @param {string} queueUrl  - The resolved queue URL.
 * @param {object} store     - The in-memory queue store.
 * @param {object} h         - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
function handleReceiveMessage(body, queueUrl, store, h) {
  const requested = body.MaxNumberOfMessages ?? 1
  const maxMessages = Math.min(Math.max(1, requested), 10)

  const records = store.receive(queueUrl, maxMessages)

  if (records.length === 0) {
    return h.response({}).code(200).type('application/x-amz-json-1.0')
  }

  const messages = records.map((r) => ({
    MessageId: r.messageId,
    ReceiptHandle: r.receiptHandle,
    Body: r.body,
    MD5OfBody: md5(r.body),
    MessageAttributes: r.attributes,
  }))

  return h
    .response({ Messages: messages })
    .code(200)
    .type('application/x-amz-json-1.0')
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hapi route handler that dispatches SQS JSON-RPC requests to
 * per-action handlers.
 *
 * Routing:
 * 1. Extract `QueueUrl` from the JSON body and find the matching queue in the
 *    registry.  Unknown queues → 404 `NonExistentQueue`.
 * 2. Read the `X-Amz-Target` header to determine the action.
 *    Unknown actions → 400 `UnknownOperation`.
 * 3. Delegate to `handleSendMessage` or `handleReceiveMessage`.
 *
 * @param {{
 *   store:    ReturnType<import('./queue-store.js').createQueueStore>,
 *   registry: ReturnType<import('../../provisioner/registry.js').createRegistry>,
 * }} options
 *
 * @returns {(request: object, h: object) => Promise<object>}
 *   A Hapi route handler `async (request, h) => response`.
 */
export function createSqsHandlers({ store, registry }) {
  return async function sqsHandler(request, h) {
    const body = request.payload ?? {}

    // 1. Resolve queue URL.
    const queueUrl = body.QueueUrl

    let matchedQueue = null
    for (const q of allSqsQueues(registry)) {
      if (q.url === queueUrl) {
        matchedQueue = q
        break
      }
    }

    if (!matchedQueue) {
      return errorResponse(
        h,
        404,
        'AWS.SimpleQueueService.NonExistentQueue',
        'Queue does not exist.',
      )
    }

    // 2. Determine the action from the X-Amz-Target header.
    const targetHeader =
      request.headers['x-amz-target'] ?? request.headers['X-Amz-Target'] ?? ''
    const action = targetHeader.split('.').pop()

    // 3. Dispatch.
    switch (action) {
      case 'SendMessage':
        return handleSendMessage(body, queueUrl, store, h)

      case 'ReceiveMessage':
        return handleReceiveMessage(body, queueUrl, store, h)

      default:
        return errorResponse(
          h,
          400,
          'AWS.SimpleQueueService.UnknownOperation',
          `Unknown action: ${action}`,
        )
    }
  }
}
