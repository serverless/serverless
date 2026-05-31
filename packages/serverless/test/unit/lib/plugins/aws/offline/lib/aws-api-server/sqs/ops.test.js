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
const FIFO_QUEUE_URL = 'http://localhost:3002/000000000000/TestQueue.fifo'

/**
 * Build a store + registry with a single queue registered. A FIFO queue is
 * named with the `.fifo` suffix AWS requires.
 *
 * @returns {{ store: object, registry: object, ctx: object }}
 */
function setup({ fifo = false, contentBasedDedup = false } = {}) {
  const store = createQueueStore()
  const registry = createRegistry()

  const name = fifo ? 'TestQueue.fifo' : 'TestQueue'
  const url = fifo ? FIFO_QUEUE_URL : QUEUE_URL

  store.ensureQueue(url, { fifo, contentBasedDedup })
  registerSqsQueue(registry, {
    logicalId: 'TestQueue',
    name,
    arn: `arn:aws:sqs:us-east-1:000000000000:${name}`,
    url,
    properties: {},
  })

  return { store, registry, ctx: { store, registry }, url }
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
  const { ctx, url } = setup({ fifo: true })

  const result = runOp(
    'SendMessage',
    {
      QueueUrl: url,
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
// Batch request validation (M2): EmptyBatchRequest / TooManyEntriesInBatchRequest
// / BatchEntryIdsNotDistinct apply to all three batch actions.
// ---------------------------------------------------------------------------

const BATCH_ACTIONS = [
  ['SendMessageBatch', (id) => ({ Id: id, MessageBody: 'x' })],
  ['DeleteMessageBatch', (id) => ({ Id: id, ReceiptHandle: `rh-${id}` })],
  [
    'ChangeMessageVisibilityBatch',
    (id) => ({ Id: id, ReceiptHandle: `rh-${id}`, VisibilityTimeout: 10 }),
  ],
]

for (const [action, makeEntry] of BATCH_ACTIONS) {
  it(`${action} with an empty Entries throws EmptyBatchRequest (400, SenderFault)`, () => {
    const { ctx } = setup()

    const err = catchOpError(() =>
      runOp(action, { QueueUrl: QUEUE_URL, Entries: [] }, ctx),
    )

    expect(err).toBeInstanceOf(SqsOpError)
    expect(err.awsCode).toBe('AWS.SimpleQueueService.EmptyBatchRequest')
    expect(err.httpStatus).toBe(400)
  })

  it(`${action} with more than 10 entries throws TooManyEntriesInBatchRequest (400)`, () => {
    const { ctx } = setup()
    const Entries = Array.from({ length: 11 }, (_, i) => makeEntry(String(i)))

    const err = catchOpError(() =>
      runOp(action, { QueueUrl: QUEUE_URL, Entries }, ctx),
    )

    expect(err.awsCode).toBe(
      'AWS.SimpleQueueService.TooManyEntriesInBatchRequest',
    )
    expect(err.httpStatus).toBe(400)
  })

  it(`${action} with duplicate entry Ids throws BatchEntryIdsNotDistinct (400)`, () => {
    const { ctx } = setup()
    const Entries = [makeEntry('dup'), makeEntry('dup')]

    const err = catchOpError(() =>
      runOp(action, { QueueUrl: QUEUE_URL, Entries }, ctx),
    )

    expect(err.awsCode).toBe('AWS.SimpleQueueService.BatchEntryIdsNotDistinct')
    expect(err.httpStatus).toBe(400)
  })
}

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

it('ReceiveMessage honors a valid MaxNumberOfMessages (1-10)', () => {
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

it('ReceiveMessage surfaces system Attributes (ApproximateReceiveCount, SentTimestamp) when requested', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, AttributeNames: ['All'] },
    ctx,
  )
  const msg = result.Messages[0]

  expect(msg.Attributes.ApproximateReceiveCount).toBe('1')
  expect(msg.Attributes.SentTimestamp).toEqual(expect.any(String))
})

it('ReceiveMessage with MaxNumberOfMessages below 1 throws InvalidParameterValue (400)', () => {
  const { ctx } = setup()

  const err = catchOpError(() =>
    runOp(
      'ReceiveMessage',
      { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 0 },
      ctx,
    ),
  )

  expect(err).toBeInstanceOf(SqsOpError)
  expect(err.awsCode).toBe('AWS.SimpleQueueService.InvalidParameterValue')
  expect(err.httpStatus).toBe(400)
})

it('ReceiveMessage with MaxNumberOfMessages above 10 throws InvalidParameterValue (400)', () => {
  const { ctx } = setup()

  const err = catchOpError(() =>
    runOp(
      'ReceiveMessage',
      { QueueUrl: QUEUE_URL, MaxNumberOfMessages: 11 },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('AWS.SimpleQueueService.InvalidParameterValue')
  expect(err.httpStatus).toBe(400)
})

it('ReceiveMessage omits system Attributes when none are requested', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  expect(result.Messages[0]).not.toHaveProperty('Attributes')
})

it('ReceiveMessage returns only the requested system Attributes', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, AttributeNames: ['ApproximateReceiveCount'] },
    ctx,
  )
  const attrs = result.Messages[0].Attributes

  expect(attrs.ApproximateReceiveCount).toBe('1')
  expect(attrs).not.toHaveProperty('SentTimestamp')
  expect(attrs).not.toHaveProperty('SenderId')
})

it('ReceiveMessage with AttributeNames All returns every system Attribute', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, AttributeNames: ['All'] },
    ctx,
  )
  const attrs = result.Messages[0].Attributes

  expect(attrs.ApproximateReceiveCount).toBe('1')
  expect(attrs.SentTimestamp).toEqual(expect.any(String))
  expect(attrs.SenderId).toEqual(expect.any(String))
})

it('ReceiveMessage honors MessageSystemAttributeNames for system Attributes', () => {
  const { ctx } = setup()
  runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx)

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, MessageSystemAttributeNames: ['SentTimestamp'] },
    ctx,
  )
  const attrs = result.Messages[0].Attributes

  expect(attrs.SentTimestamp).toEqual(expect.any(String))
  expect(attrs).not.toHaveProperty('ApproximateReceiveCount')
})

it('ReceiveMessage omits MessageAttributes when none are requested', () => {
  const { ctx } = setup()
  runOp(
    'SendMessage',
    {
      QueueUrl: QUEUE_URL,
      MessageBody: 'x',
      MessageAttributes: { Author: { DataType: 'String', StringValue: 'a' } },
    },
    ctx,
  )

  const result = runOp('ReceiveMessage', { QueueUrl: QUEUE_URL }, ctx)

  expect(result.Messages[0]).not.toHaveProperty('MessageAttributes')
  expect(result.Messages[0]).not.toHaveProperty('MD5OfMessageAttributes')
})

it('ReceiveMessage returns only the requested user MessageAttributes', () => {
  const { ctx } = setup()
  runOp(
    'SendMessage',
    {
      QueueUrl: QUEUE_URL,
      MessageBody: 'x',
      MessageAttributes: {
        Author: { DataType: 'String', StringValue: 'alice' },
        Topic: { DataType: 'String', StringValue: 'news' },
      },
    },
    ctx,
  )

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, MessageAttributeNames: ['Author'] },
    ctx,
  )
  const msg = result.Messages[0]

  expect(msg.MessageAttributes).toEqual({
    Author: { DataType: 'String', StringValue: 'alice' },
  })
})

it('ReceiveMessage with MessageAttributeNames All returns all user MessageAttributes', () => {
  const { ctx } = setup()
  runOp(
    'SendMessage',
    {
      QueueUrl: QUEUE_URL,
      MessageBody: 'x',
      MessageAttributes: {
        Author: { DataType: 'String', StringValue: 'alice' },
        Topic: { DataType: 'String', StringValue: 'news' },
      },
    },
    ctx,
  )

  const result = runOp(
    'ReceiveMessage',
    { QueueUrl: QUEUE_URL, MessageAttributeNames: ['All'] },
    ctx,
  )

  expect(Object.keys(result.Messages[0].MessageAttributes).sort()).toEqual([
    'Author',
    'Topic',
  ])
})

// ---------------------------------------------------------------------------
// FIFO request-parameter validation (M4).
// ---------------------------------------------------------------------------

it('SendMessage to a FIFO queue without MessageGroupId throws MissingParameter (400)', () => {
  const { ctx, url } = setup({ fifo: true })

  const err = catchOpError(() =>
    runOp(
      'SendMessage',
      { QueueUrl: url, MessageBody: 'x', MessageDeduplicationId: 'd1' },
      ctx,
    ),
  )

  expect(err).toBeInstanceOf(SqsOpError)
  expect(err.awsCode).toBe('AWS.SimpleQueueService.MissingParameter')
  expect(err.httpStatus).toBe(400)
})

it('SendMessage to a FIFO queue without MessageDeduplicationId (content-based off) throws InvalidParameterValue (400)', () => {
  const { ctx, url } = setup({ fifo: true })

  const err = catchOpError(() =>
    runOp(
      'SendMessage',
      { QueueUrl: url, MessageBody: 'x', MessageGroupId: 'g1' },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('AWS.SimpleQueueService.InvalidParameterValue')
  expect(err.httpStatus).toBe(400)
})

it('SendMessage to a FIFO queue with content-based dedup needs no MessageDeduplicationId', () => {
  const { ctx, url } = setup({ fifo: true, contentBasedDedup: true })

  expect(() =>
    runOp(
      'SendMessage',
      { QueueUrl: url, MessageBody: 'x', MessageGroupId: 'g1' },
      ctx,
    ),
  ).not.toThrow()
})

it('SendMessageBatch to a FIFO queue validates each entry for MessageGroupId', () => {
  const { ctx, url } = setup({ fifo: true })

  const err = catchOpError(() =>
    runOp(
      'SendMessageBatch',
      {
        QueueUrl: url,
        Entries: [{ Id: 'a', MessageBody: 'x', MessageDeduplicationId: 'd1' }],
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('AWS.SimpleQueueService.MissingParameter')
  expect(err.httpStatus).toBe(400)
})

it('SendMessage to a non-FIFO queue needs no MessageGroupId', () => {
  const { ctx } = setup()

  expect(() =>
    runOp('SendMessage', { QueueUrl: QUEUE_URL, MessageBody: 'x' }, ctx),
  ).not.toThrow()
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
