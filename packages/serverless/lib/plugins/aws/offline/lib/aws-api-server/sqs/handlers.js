/**
 * Hapi route handler factory for SQS.
 *
 * Implements SendMessage and ReceiveMessage operations. SDK v3 sends SQS
 * requests using the JSON-RPC protocol with:
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

/** Transport-type byte AWS prepends to a String attribute value. */
const STRING_TYPE_FIELD_INDEX = 1
/** Transport-type byte AWS prepends to a Binary attribute value. */
const BINARY_TYPE_FIELD_INDEX = 2

/**
 * Push a 4-byte big-endian length prefix followed by the bytes themselves
 * into the running hash. AWS prefixes every variable-length segment of the
 * attribute serialization this way.
 *
 * @param {import('node:crypto').Hash} hash
 * @param {Buffer} buf
 */
function updateLengthAndValue(hash, buf) {
  const lengthPrefix = Buffer.alloc(4)
  lengthPrefix.writeUInt32BE(buf.length, 0)
  hash.update(lengthPrefix)
  hash.update(buf)
}

/**
 * Compute `MD5OfMessageAttributes` for a SendMessage call's attribute map.
 *
 * AWS specifies the algorithm precisely (the SDKs verify it):
 *   for each attribute, sorted alphabetically by Name:
 *     encode Name             (length-prefixed UTF-8)
 *     encode DataType         (length-prefixed UTF-8)
 *     write transport-type byte (1 for String, 2 for Binary)
 *     encode value            (length-prefixed UTF-8 / raw bytes)
 *   MD5 the resulting buffer.
 *
 * Returns `undefined` when there are no attributes — the caller omits the
 * field from the response (matching AWS).
 *
 * @param {Record<string, { DataType: string, StringValue?: string, BinaryValue?: string | Buffer }>} attributes
 * @returns {string | undefined} Lower-case hex MD5, or undefined when empty.
 */
function md5OfMessageAttributes(attributes) {
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Object.keys(attributes).length === 0
  ) {
    return undefined
  }

  const hash = createHash('md5')
  const sortedNames = Object.keys(attributes).sort()

  for (const name of sortedNames) {
    const attr = attributes[name]
    if (!attr || typeof attr !== 'object') continue

    updateLengthAndValue(hash, Buffer.from(name, 'utf8'))
    updateLengthAndValue(hash, Buffer.from(attr.DataType ?? '', 'utf8'))

    if (attr.StringValue !== undefined && attr.StringValue !== null) {
      hash.update(Buffer.from([STRING_TYPE_FIELD_INDEX]))
      updateLengthAndValue(hash, Buffer.from(String(attr.StringValue), 'utf8'))
    } else if (attr.BinaryValue !== undefined && attr.BinaryValue !== null) {
      hash.update(Buffer.from([BINARY_TYPE_FIELD_INDEX]))
      const binary = Buffer.isBuffer(attr.BinaryValue)
        ? attr.BinaryValue
        : Buffer.from(String(attr.BinaryValue), 'base64')
      updateLengthAndValue(hash, binary)
    }
  }

  return hash.digest('hex')
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

  const attributes = body.MessageAttributes ?? {}

  const { messageId } = store.send(queueUrl, body.MessageBody, attributes)

  const responseBody = {
    MD5OfMessageBody: md5(body.MessageBody),
    MessageId: messageId,
  }

  const attributesMd5 = md5OfMessageAttributes(attributes)
  if (attributesMd5 !== undefined) {
    responseBody.MD5OfMessageAttributes = attributesMd5
  }

  return h.response(responseBody).code(200).type('application/x-amz-json-1.0')
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
