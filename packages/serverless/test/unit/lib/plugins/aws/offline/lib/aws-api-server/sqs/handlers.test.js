import { createSqsHandlers } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/handlers.js'
import { createQueueStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import {
  createRegistry,
  registerSqsQueue,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const QUEUE_URL = 'http://localhost:4566/000000000000/TestQueue'

/**
 * Build a minimal fake Hapi response toolkit that supports the fluent
 * `.response(payload).code(n).type(s)` chain.
 *
 * The final result is an inspectable object with `{ payload, statusCode, contentType }`.
 *
 * @returns {{ response: Function, _last: () => object }}
 */
function makeH() {
  let _result = {}

  const toolkit = {
    response(payload) {
      _result = { payload, statusCode: 200, contentType: '' }
      return {
        code(n) {
          _result.statusCode = n
          return this
        },
        type(t) {
          _result.contentType = t
          return this
        },
      }
    },
    _last() {
      return _result
    },
  }

  return toolkit
}

/**
 * Build a minimal fake Hapi request.
 *
 * @param {{ action: string, body?: object }} opts
 * @returns {{ headers: object, payload: object }}
 */
function makeRequest({ action, body = {} }) {
  return {
    headers: {
      'x-amz-target': `AmazonSQS.${action}`,
      'content-type': 'application/x-amz-json-1.0',
    },
    payload: body,
  }
}

/**
 * Set up store + registry with one queue at QUEUE_URL, return handler + helpers.
 */
function setup() {
  const store = createQueueStore()
  const registry = createRegistry()

  store.ensureQueue(QUEUE_URL)
  registerSqsQueue(registry, {
    logicalId: 'TestQueue',
    name: 'TestQueue',
    arn: 'arn:aws:sqs:us-east-1:000000000000:TestQueue',
    url: QUEUE_URL,
    properties: {},
  })

  const handler = createSqsHandlers({ store, registry })
  return { handler, store, registry }
}

// ---------------------------------------------------------------------------
// 1. SendMessage happy path
// ---------------------------------------------------------------------------

it('1. SendMessage returns 200 with MD5OfMessageBody and MessageId; size reflects new message', async () => {
  const { handler, store } = setup()
  const h = makeH()

  const request = makeRequest({
    action: 'SendMessage',
    body: { QueueUrl: QUEUE_URL, MessageBody: 'hello world' },
  })

  await handler(request, h)
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('application/x-amz-json-1.0')
  expect(typeof result.payload.MD5OfMessageBody).toBe('string')
  expect(result.payload.MD5OfMessageBody.length).toBeGreaterThan(0)
  expect(typeof result.payload.MessageId).toBe('string')
  expect(result.payload.MessageId.length).toBeGreaterThan(0)

  // Store should now contain the message.
  expect(store.size(QUEUE_URL)).toBe(1)
})

// ---------------------------------------------------------------------------
// 2. ReceiveMessage when empty returns {} (no Messages key)
// ---------------------------------------------------------------------------

it('2. ReceiveMessage on empty queue returns 200 with no Messages key', async () => {
  const { handler } = setup()
  const h = makeH()

  const request = makeRequest({
    action: 'ReceiveMessage',
    body: { QueueUrl: QUEUE_URL },
  })

  await handler(request, h)
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.payload).not.toHaveProperty('Messages')
})

// ---------------------------------------------------------------------------
// 3. ReceiveMessage after send returns Messages array with correct fields
// ---------------------------------------------------------------------------

it('3. ReceiveMessage after SendMessage returns Messages with MessageId, ReceiptHandle, Body, MD5OfBody', async () => {
  const { handler } = setup()

  // Send first.
  const sendH = makeH()
  await handler(
    makeRequest({
      action: 'SendMessage',
      body: { QueueUrl: QUEUE_URL, MessageBody: 'test-body' },
    }),
    sendH,
  )

  // Then receive.
  const receiveH = makeH()
  await handler(
    makeRequest({ action: 'ReceiveMessage', body: { QueueUrl: QUEUE_URL } }),
    receiveH,
  )

  const result = receiveH._last()
  expect(result.statusCode).toBe(200)
  expect(Array.isArray(result.payload.Messages)).toBe(true)
  expect(result.payload.Messages).toHaveLength(1)

  const msg = result.payload.Messages[0]
  expect(typeof msg.MessageId).toBe('string')
  expect(typeof msg.ReceiptHandle).toBe('string')
  expect(msg.Body).toBe('test-body')
  expect(typeof msg.MD5OfBody).toBe('string')
  expect(msg.MD5OfBody.length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 4. ReceiveMessage respects MaxNumberOfMessages
// ---------------------------------------------------------------------------

it('4. ReceiveMessage respects MaxNumberOfMessages — send 5, receive 2', async () => {
  const { handler } = setup()

  for (let i = 0; i < 5; i++) {
    const h = makeH()
    await handler(
      makeRequest({
        action: 'SendMessage',
        body: { QueueUrl: QUEUE_URL, MessageBody: `msg-${i}` },
      }),
      h,
    )
  }

  const receiveH = makeH()
  await handler(
    makeRequest({
      action: 'ReceiveMessage',
      body: { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 2 },
    }),
    receiveH,
  )

  const result = receiveH._last()
  expect(result.statusCode).toBe(200)
  expect(result.payload.Messages).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// 5. Queue not in registry → 404 NonExistentQueue
// ---------------------------------------------------------------------------

it('5. QueueUrl not in registry returns 404 NonExistentQueue', async () => {
  const { handler } = setup()
  const h = makeH()

  const request = makeRequest({
    action: 'SendMessage',
    body: {
      QueueUrl: 'http://localhost:4566/000000000000/Ghost',
      MessageBody: 'x',
    },
  })

  await handler(request, h)
  const result = h._last()

  expect(result.statusCode).toBe(404)
  expect(result.payload.__type).toBe('AWS.SimpleQueueService.NonExistentQueue')
})

// ---------------------------------------------------------------------------
// 6. Unknown action header → 400 UnknownOperation
// ---------------------------------------------------------------------------

it('6. Unknown X-Amz-Target action returns 400 UnknownOperation', async () => {
  const { handler } = setup()
  const h = makeH()

  const request = {
    headers: {
      'x-amz-target': 'AmazonSQS.DeleteMessage',
      'content-type': 'application/x-amz-json-1.0',
    },
    payload: { QueueUrl: QUEUE_URL },
  }

  await handler(request, h)
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.payload.__type).toBe('AWS.SimpleQueueService.UnknownOperation')
})

// ---------------------------------------------------------------------------
// 7. SendMessage without attributes omits MD5OfMessageAttributes
// ---------------------------------------------------------------------------

it('7. SendMessage without attributes does not return MD5OfMessageAttributes', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    makeRequest({
      action: 'SendMessage',
      body: { QueueUrl: QUEUE_URL, MessageBody: 'no attrs' },
    }),
    h,
  )

  expect(h._last().payload).not.toHaveProperty('MD5OfMessageAttributes')
})

// ---------------------------------------------------------------------------
// 8. SendMessage with a String attribute returns the AWS-specified MD5
// ---------------------------------------------------------------------------

it('8. SendMessage with a String attribute returns the canonical MD5OfMessageAttributes', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    makeRequest({
      action: 'SendMessage',
      body: {
        QueueUrl: QUEUE_URL,
        MessageBody: 'hi',
        MessageAttributes: {
          Author: { DataType: 'String', StringValue: 'alice' },
        },
      },
    }),
    h,
  )

  // Canonical MD5 of one String attribute {Author: alice} computed against
  // the AWS spec serialization (length-prefixed UTF-8 name + length-prefixed
  // UTF-8 data type + transport-type byte + length-prefixed value). This is
  // the exact value the AWS SDKs verify on response.
  expect(h._last().payload.MD5OfMessageAttributes).toBe(
    'e359dfbf3997df0b05607a5e2e457d9b',
  )
})

// ---------------------------------------------------------------------------
// 9. SendMessage with multiple attributes sorts by name before hashing
// ---------------------------------------------------------------------------

it('9. SendMessage with multiple attributes produces the same MD5 regardless of input key order', async () => {
  const { handler: handlerA } = setup()
  const { handler: handlerB } = setup()
  const hA = makeH()
  const hB = makeH()

  const attrs = {
    Beta: { DataType: 'String', StringValue: '2' },
    Alpha: { DataType: 'String', StringValue: '1' },
  }

  await handlerA(
    makeRequest({
      action: 'SendMessage',
      body: { QueueUrl: QUEUE_URL, MessageBody: 'x', MessageAttributes: attrs },
    }),
    hA,
  )

  const reordered = {
    Alpha: attrs.Alpha,
    Beta: attrs.Beta,
  }

  await handlerB(
    makeRequest({
      action: 'SendMessage',
      body: {
        QueueUrl: QUEUE_URL,
        MessageBody: 'x',
        MessageAttributes: reordered,
      },
    }),
    hB,
  )

  expect(hA._last().payload.MD5OfMessageAttributes).toBe(
    hB._last().payload.MD5OfMessageAttributes,
  )
  expect(hA._last().payload.MD5OfMessageAttributes).toMatch(/^[0-9a-f]{32}$/)
})
