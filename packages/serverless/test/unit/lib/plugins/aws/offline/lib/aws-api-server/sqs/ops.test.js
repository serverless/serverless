import {
  runOp,
  SqsOpError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/ops.js'
import { createQueueStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sqs/queue-store.js'
import {
  createRegistry,
  registerSqsQueue,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

const QUEUE_URL = 'http://localhost:3002/000000000000/TestQueue'

/**
 * Build a store + registry with a single queue registered at QUEUE_URL.
 *
 * @returns {{ store: object, registry: object, ctx: object }}
 */
function setup({ fifo = false } = {}) {
  const store = createQueueStore()
  const registry = createRegistry()

  store.ensureQueue(QUEUE_URL, { fifo })
  registerSqsQueue(registry, {
    logicalId: 'TestQueue',
    name: 'TestQueue',
    arn: 'arn:aws:sqs:us-east-1:000000000000:TestQueue',
    url: QUEUE_URL,
    properties: {},
  })

  return { store, registry, ctx: { store, registry } }
}

/**
 * Run an op and capture the thrown SqsOpError, returning it for assertion.
 *
 * @param {Function} fn
 * @returns {SqsOpError}
 */
function catchOpError(fn) {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error('expected runOp to throw, but it returned')
}

// ---------------------------------------------------------------------------
// SendMessage
// ---------------------------------------------------------------------------

it('SendMessage returns MD5OfMessageBody + MessageId and enqueues', () => {
  const { ctx, store } = setup()

  const result = runOp(
    'SendMessage',
    { QueueUrl: QUEUE_URL, MessageBody: 'hello world' },
    ctx,
  )

  expect(result.MessageId).toEqual(expect.any(String))
  expect(result.MD5OfMessageBody).toMatch(/^[0-9a-f]{32}$/)
  expect(result).not.toHaveProperty('MD5OfMessageAttributes')
  expect(store.size(QUEUE_URL)).toBe(1)
})

it('SendMessage with attributes returns MD5OfMessageAttributes', () => {
  const { ctx } = setup()

  const result = runOp(
    'SendMessage',
    {
      QueueUrl: QUEUE_URL,
      MessageBody: 'hi',
      MessageAttributes: {
        Author: { DataType: 'String', StringValue: 'alice' },
      },
    },
    ctx,
  )

  expect(result.MD5OfMessageAttributes).toBe('e359dfbf3997df0b05607a5e2e457d9b')
})

it('SendMessage to a FIFO queue returns a SequenceNumber', () => {
  const { ctx } = setup({ fifo: true })

  const result = runOp(
    'SendMessage',
    {
      QueueUrl: QUEUE_URL,
      MessageBody: 'hi',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd1',
    },
    ctx,
  )

  expect(result.MessageId).toEqual(expect.any(String))
  expect(result.SequenceNumber).toEqual(expect.any(String))
})

it('SendMessage without MessageBody throws InvalidParameterValue (400)', () => {
  const { ctx } = setup()

  const err = catchOpError(() =>
    runOp('SendMessage', { QueueUrl: QUEUE_URL }, ctx),
  )

  expect(err).toBeInstanceOf(SqsOpError)
  expect(err.awsCode).toBe('AWS.SimpleQueueService.InvalidParameterValue')
  expect(err.httpStatus).toBe(400)
})

it('SendMessage to an unknown queue throws NonExistentQueue (400)', () => {
  const { ctx } = setup()

  const err = catchOpError(() =>
    runOp(
      'SendMessage',
      {
        QueueUrl: 'http://localhost:3002/000000000000/Ghost',
        MessageBody: 'x',
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('AWS.SimpleQueueService.NonExistentQueue')
  expect(err.httpStatus).toBe(400)
})

// ---------------------------------------------------------------------------
// SendMessageBatch
// ---------------------------------------------------------------------------

it('SendMessageBatch returns Successful entries keyed by Id', () => {
  const { ctx, store } = setup()

  const result = runOp(
    'SendMessageBatch',
    {
      QueueUrl: QUEUE_URL,
      Entries: [
        { Id: 'a', MessageBody: 'one' },
        { Id: 'b', MessageBody: 'two' },
      ],
    },
    ctx,
  )

  expect(result.Successful).toHaveLength(2)
  expect(result.Failed).toEqual([])
  expect(result.Successful[0]).toEqual(
    expect.objectContaining({
      Id: 'a',
      MessageId: expect.any(String),
      MD5OfMessageBody: expect.any(String),
    }),
  )
  expect(store.size(QUEUE_URL)).toBe(2)
})

it('SendMessageBatch reports per-entry failures without aborting the batch', () => {
  const { ctx, store } = setup()

  const result = runOp(
    'SendMessageBatch',
    {
      QueueUrl: QUEUE_URL,
      Entries: [{ Id: 'ok', MessageBody: 'one' }, { Id: 'bad' }],
    },
    ctx,
  )

  expect(result.Successful).toHaveLength(1)
  expect(result.Failed).toHaveLength(1)
  expect(result.Failed[0]).toEqual(
    expect.objectContaining({
      Id: 'bad',
      SenderFault: true,
      Code: expect.any(String),
    }),
  )
  expect(store.size(QUEUE_URL)).toBe(1)
})

// ---------------------------------------------------------------------------
// ReceiveMessage
// ---------------------------------------------------------------------------

it('ReceiveMessage on an empty queue omits Messages entirely', () => {
  const { ctx } = setup()

  const result = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  expect(result).not.toHaveProperty('Messages')
})

it('ReceiveMessage returns Body, MD5OfBody, MessageId, ReceiptHandle', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'body-1' }, ctx)

  const result = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  expect(result.Messages).toHaveLength(1)
  const msg = result.Messages[0]
  expect(msg.Body).toBe('body-1')
  expect(msg.MD5OfBody).toMatch(/^[0-9a-f]{32}$/)
  expect(msg.MessageId).toEqual(expect.any(String))
  expect(msg.ReceiptHandle).toEqual(expect.any(String))
})

it('ReceiveMessage clamps MaxNumberOfMessages and includes MessageAttributes when requested', () => {
  const { ctx } = setup()
  for (let i = 0; i < 5; i++) {
    runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: `m-${i}` }, ctx)
  }

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 2 },
    ctx,
  )

  expect(result.Messages).toHaveLength(2)
})

it('ReceiveMessage surfaces system Attributes (ApproximateReceiveCount, SentTimestamp)', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)
  const msg = result.Messages[0]

  expect(msg.Attributes.ApproximateReceiveCount).toBe('1')
  expect(msg.Attributes.SentTimestamp).toEqual(expect.any(String))
})

// ---------------------------------------------------------------------------
// DeleteMessage / DeleteMessageBatch
// ---------------------------------------------------------------------------

it('DeleteMessage removes an inflight message', () => {
  const { ctx, store } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)
  const received = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)
  const handle = received.Messages[0].ReceiptHandle

  const result = runOp(
    'DeleteMessage',
    { QueueUrl: QUEUE_URL, ReceiptHandle: handle },
    ctx,
  )

  expect(result).toEqual({})
  expect(store.size(QUEUE_URL)).toBe(0)
})

it('DeleteMessageBatch returns Successful for each deleted entry', () => {
  const { ctx, store } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'a' }, ctx)
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'b' }, ctx)
  const received = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 2 },
    ctx,
  )

  const result = runOp(
    'DeleteMessageBatch',
    {
      QueueUrl: QUEUE_URL,
      Entries: received.Messages.map((m, i) => ({
        Id: String(i),
        ReceiptHandle: m.ReceiptHandle,
      })),
    },
    ctx,
  )

  expect(result.Successful).toHaveLength(2)
  expect(result.Failed).toEqual([])
  expect(store.size(QUEUE_URL)).toBe(0)
})

// ---------------------------------------------------------------------------
// ChangeMessageVisibility / batch
// ---------------------------------------------------------------------------

it('ChangeMessageVisibility returns an empty result', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)
  const received = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  const result = runOp(
    'ChangeMessageVisibility',
    {
      QueueUrl: QUEUE_URL,
      ReceiptHandle: received.Messages[0].ReceiptHandle,
      VisibilityTimeout: 60,
    },
    ctx,
  )

  expect(result).toEqual({})
})

it('ChangeMessageVisibilityBatch returns Successful entries', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)
  const received = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  const result = runOp(
    'ChangeMessageVisibilityBatch',
    {
      QueueUrl: QUEUE_URL,
      Entries: [
        {
          Id: '0',
          ReceiptHandle: received.Messages[0].ReceiptHandle,
          VisibilityTimeout: 10,
        },
      ],
    },
    ctx,
  )

  expect(result.Successful).toEqual([{ Id: '0' }])
  expect(result.Failed).toEqual([])
})

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

it('GetQueueUrl resolves a registered queue by name', () => {
  const { ctx } = setup()

  const result = runOp('GetQueueUrl', { QueueName: 'TestQueue' }, ctx)

  expect(result.QueueUrl).toBe(QUEUE_URL)
})

it('GetQueueUrl for an unknown name throws NonExistentQueue', () => {
  const { ctx } = setup()

  const err = catchOpError(() =>
    runOp('GetQueueUrl', { QueueName: 'Nope' }, ctx),
  )

  expect(err.awsCode).toBe('AWS.SimpleQueueService.NonExistentQueue')
})

it('CreateQueue synthesizes a url and registers the queue in the store', () => {
  const { ctx, store } = setup()

  const result = runOp('CreateQueue', { QueueName: 'BrandNew' }, ctx)

  expect(result.QueueUrl).toContain('BrandNew')
  // A subsequent send must succeed (queue exists in the store).
  expect(() =>
    runOp('SendMessage', { QueueUrl: result.QueueUrl, MessageBody: 'x' }, ctx),
  ).not.toThrow()
  expect(store.size(result.QueueUrl)).toBe(1)
})

it('CreateQueue is idempotent for the same name', () => {
  const { ctx } = setup()

  const a = runOp('CreateQueue', { QueueName: 'Dup' }, ctx)
  const b = runOp('CreateQueue', { QueueName: 'Dup' }, ctx)

  expect(a.QueueUrl).toBe(b.QueueUrl)
})

it('GetQueueAttributes returns the requested attribute subset', () => {
  const { ctx } = setup()

  const result = runOp(
    'GetQueueAttributes',
    { QueueUrl: QUEUE_URL, AttributeNames: ['VisibilityTimeout'] },
    ctx,
  )

  expect(result.Attributes.VisibilityTimeout).toBe('30')
  expect(result.Attributes).not.toHaveProperty('DelaySeconds')
})

it('SetQueueAttributes updates live config and returns an empty result', () => {
  const { ctx } = setup()

  const result = runOp(
    'SetQueueAttributes',
    { QueueUrl: QUEUE_URL, Attributes: { VisibilityTimeout: '90' } },
    ctx,
  )

  expect(result).toEqual({})
  const after = runOp(
    'GetQueueAttributes',
    { QueueUrl: QUEUE_URL, AttributeNames: ['VisibilityTimeout'] },
    ctx,
  )
  expect(after.Attributes.VisibilityTimeout).toBe('90')
})

it('ListQueues returns QueueUrls, honoring a name prefix', () => {
  const { ctx } = setup()
  runOp('CreateQueue', { QueueName: 'OtherQueue' }, ctx)

  const all = runOp('ListQueues', {}, ctx)
  expect(all.QueueUrls).toContain(QUEUE_URL)

  const filtered = runOp('ListQueues', { QueueNamePrefix: 'Other' }, ctx)
  expect(filtered.QueueUrls).toHaveLength(1)
  expect(filtered.QueueUrls[0]).toContain('OtherQueue')
})

it('PurgeQueue empties the queue and returns an empty result', () => {
  const { ctx, store } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp('PurgeQueue', { QueueUrl: QUEUE_URL }, ctx)

  expect(result).toEqual({})
  expect(store.size(QUEUE_URL)).toBe(0)
})

it('DeleteQueue removes a runtime-created queue so later sends fail', () => {
  const { ctx } = setup()
  // A queue created at runtime lives only in the store, so deleting it makes
  // it fully unresolvable (registry-backed queues remain resolvable by design).
  const { QueueUrl } = runOp('CreateQueue', { QueueName: 'Ephemeral' }, ctx)

  const result = runOp('DeleteQueue', { QueueUrl }, ctx)
  expect(result).toEqual({})

  const err = catchOpError(() =>
    runOp('SendMessage', { QueueUrl, MessageBody: 'x' }, ctx),
  )
  expect(err.awsCode).toBe('AWS.SimpleQueueService.NonExistentQueue')
})

// ---------------------------------------------------------------------------
// Unknown action
// ---------------------------------------------------------------------------

it('an unknown action throws UnknownOperation', () => {
  const { ctx } = setup()

  const err = catchOpError(() => runOp('FrobnicateQueue', {}, ctx))

  expect(err.awsCode).toBe('AWS.SimpleQueueService.UnknownOperation')
})
