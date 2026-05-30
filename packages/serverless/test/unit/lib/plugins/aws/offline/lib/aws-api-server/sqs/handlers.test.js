import { createSqsHandlers } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/handlers.js'
import { createQueueStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import {
  createRegistry,
  registerSqsQueue,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const QUEUE_URL = 'http://localhost:3002/000000000000/TestQueue'

/**
 * Build a minimal fake Hapi response toolkit that supports the fluent
 * `.response(payload).code(n).type(s)` chain.
 *
 * The final result is an inspectable object with
 * `{ payload, statusCode, contentType }`.
 *
 * @returns {{ response: Function, _last: () => object }}
 */
function makeH() {
  let result = {}
  const toolkit = {
    response(payload) {
      result = { payload, statusCode: 200, contentType: '' }
      const chain = {
        code(n) {
          result.statusCode = n
          return chain
        },
        type(t) {
          result.contentType = t
          return chain
        },
      }
      return chain
    },
    _last() {
      return result
    },
  }
  return toolkit
}

/**
 * Build a JSON-RPC (SDK v3) request: action via `X-Amz-Target`, JSON payload.
 *
 * @param {{ action: string, body?: object }} opts
 * @returns {{ headers: object, payload: object }}
 */
function jsonRequest({ action, body = {} }) {
  return {
    headers: {
      'x-amz-target': `AmazonSQS.${action}`,
      'content-type': 'application/x-amz-json-1.0',
    },
    payload: body,
  }
}

/**
 * Build a query-protocol request: form-urlencoded body, no `X-Amz-Target`.
 *
 * @param {string} body - The raw form-urlencoded body string.
 * @returns {{ headers: object, payload: string }}
 */
function queryRequest(body) {
  return {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: body,
  }
}

/**
 * Set up store + registry with one queue at QUEUE_URL, returning the handler.
 *
 * @returns {{ handler: Function, store: object, registry: object }}
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
// JSON-RPC protocol
// ---------------------------------------------------------------------------

it('JSON SendMessage returns 200 with MD5OfMessageBody + MessageId and enqueues', async () => {
  const { handler, store } = setup()
  const h = makeH()

  await handler(
    jsonRequest({
      action: 'SendMessage',
      body: { QueueUrl: QUEUE_URL, MessageBody: 'hello world' },
    }),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('application/x-amz-json-1.0')
  expect(result.payload.MD5OfMessageBody).toMatch(/^[0-9a-f]{32}$/)
  expect(typeof result.payload.MessageId).toBe('string')
  expect(store.size(QUEUE_URL)).toBe(1)
})

it('JSON ReceiveMessage on an empty queue returns 200 with no Messages key', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    jsonRequest({ action: 'ReceiveMessage', body: { QueueUrl: QUEUE_URL } }),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.payload).not.toHaveProperty('Messages')
})

it('JSON ReceiveMessage after SendMessage returns the message fields', async () => {
  const { handler } = setup()

  await handler(
    jsonRequest({
      action: 'SendMessage',
      body: { QueueUrl: QUEUE_URL, MessageBody: 'test-body' },
    }),
    makeH(),
  )

  const receiveH = makeH()
  await handler(
    jsonRequest({ action: 'ReceiveMessage', body: { QueueUrl: QUEUE_URL } }),
    receiveH,
  )

  const msg = receiveH._last().payload.Messages[0]
  expect(typeof msg.MessageId).toBe('string')
  expect(typeof msg.ReceiptHandle).toBe('string')
  expect(msg.Body).toBe('test-body')
  expect(msg.MD5OfBody).toMatch(/^[0-9a-f]{32}$/)
})

it('JSON ReceiveMessage respects MaxNumberOfMessages — send 5, receive 2', async () => {
  const { handler } = setup()

  for (let i = 0; i < 5; i++) {
    await handler(
      jsonRequest({
        action: 'SendMessage',
        body: { QueueUrl: QUEUE_URL, MessageBody: `msg-${i}` },
      }),
      makeH(),
    )
  }

  const receiveH = makeH()
  await handler(
    jsonRequest({
      action: 'ReceiveMessage',
      body: { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 2 },
    }),
    receiveH,
  )

  expect(receiveH._last().payload.Messages).toHaveLength(2)
})

it('JSON SendMessage with a String attribute returns the canonical MD5OfMessageAttributes', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    jsonRequest({
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

  expect(h._last().payload.MD5OfMessageAttributes).toBe(
    'e359dfbf3997df0b05607a5e2e457d9b',
  )
})

it('JSON SendMessage to an unknown queue returns NonExistentQueue (400)', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    jsonRequest({
      action: 'SendMessage',
      body: {
        QueueUrl: 'http://localhost:3002/000000000000/Ghost',
        MessageBody: 'x',
      },
    }),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.contentType).toBe('application/x-amz-json-1.0')
  expect(result.payload.__type).toBe('AWS.SimpleQueueService.NonExistentQueue')
})

it('JSON unknown X-Amz-Target action returns UnknownOperation (400)', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    jsonRequest({
      action: 'FrobnicateQueue',
      body: { QueueUrl: QUEUE_URL },
    }),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.payload.__type).toBe('AWS.SimpleQueueService.UnknownOperation')
})

// ---------------------------------------------------------------------------
// Query protocol
// ---------------------------------------------------------------------------

it('query SendMessage returns 200 XML and enqueues', async () => {
  const { handler, store } = setup()
  const h = makeH()

  await handler(
    queryRequest(
      `Action=SendMessage&QueueUrl=${encodeURIComponent(QUEUE_URL)}&MessageBody=from-query`,
    ),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(200)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<SendMessageResponse')
  expect(result.payload).toContain('<MessageId>')
  expect(store.size(QUEUE_URL)).toBe(1)
})

it('query ReceiveMessage after SendMessage returns the message in XML', async () => {
  const { handler } = setup()

  await handler(
    queryRequest(
      `Action=SendMessage&QueueUrl=${encodeURIComponent(QUEUE_URL)}&MessageBody=q-body`,
    ),
    makeH(),
  )

  const receiveH = makeH()
  await handler(
    queryRequest(
      `Action=ReceiveMessage&QueueUrl=${encodeURIComponent(QUEUE_URL)}`,
    ),
    receiveH,
  )
  const xml = receiveH._last().payload

  expect(xml).toContain('<ReceiveMessageResult>')
  expect(xml).toContain('<Body>q-body</Body>')
})

it('query SendMessage to an unknown queue returns the ErrorResponse XML (400)', async () => {
  const { handler } = setup()
  const h = makeH()

  await handler(
    queryRequest(
      'Action=SendMessage&QueueUrl=http%3A%2F%2Flocalhost%2F0%2FGhost&MessageBody=x',
    ),
    h,
  )
  const result = h._last()

  expect(result.statusCode).toBe(400)
  expect(result.contentType).toBe('text/xml')
  expect(result.payload).toContain('<ErrorResponse')
  expect(result.payload).toContain(
    '<Code>AWS.SimpleQueueService.NonExistentQueue</Code>',
  )
})
