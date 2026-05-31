import {
  runOp,
  SnsOpError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/ops.js'
import { createTopicStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/topic-store.js'
import {
  createRegistry,
  registerLambda,
  registerSqsQueue,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:TestTopic'
const FIFO_TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:TestTopic.fifo'
const LAMBDA_ARN = 'arn:aws:lambda:us-east-1:000000000000:function:my-fn'
const QUEUE_URL = 'http://localhost:3002/000000000000/TestQueue'
const QUEUE_ARN = 'arn:aws:sqs:us-east-1:000000000000:TestQueue'

/**
 * Build a store + registry pre-seeded with a topic, a lambda identity, and an
 * SQS queue, plus a spy `deliver`. Returns the ctx ops consume.
 *
 * @param {{ fifo?: boolean, contentBasedDedup?: boolean }} [opts]
 * @returns {{ store: object, registry: object, ctx: object, delivered: object[] }}
 */
function setup({ fifo = false, contentBasedDedup = false } = {}) {
  const store = createTopicStore()
  const registry = createRegistry()

  const arn = fifo ? FIFO_TOPIC_ARN : TOPIC_ARN
  const name = fifo ? 'TestTopic.fifo' : 'TestTopic'
  store.ensureTopic(arn, {
    name,
    fifo,
    attributes: contentBasedDedup ? { ContentBasedDeduplication: 'true' } : {},
  })

  registerLambda(registry, {
    logicalId: 'MyFn',
    functionKey: 'myFn',
    name: 'my-fn',
    arn: LAMBDA_ARN,
  })
  registerSqsQueue(registry, {
    logicalId: 'TestQueue',
    name: 'TestQueue',
    arn: QUEUE_ARN,
    url: QUEUE_URL,
    properties: {},
  })

  const delivered = []
  const deliver = async (topicArn, record) => {
    delivered.push({ topicArn, record })
  }

  return { store, registry, delivered, ctx: { store, registry, deliver } }
}

/**
 * Run an op and capture the thrown SnsOpError, returning it for assertion.
 *
 * @param {Function} fn
 * @returns {Promise<SnsOpError>}
 */
async function catchOpError(fn) {
  try {
    await fn()
  } catch (err) {
    return err
  }
  throw new Error('expected runOp to throw, but it returned')
}

// ---------------------------------------------------------------------------
// CreateTopic
// ---------------------------------------------------------------------------

it('CreateTopic synthesises a topic ARN from the name', async () => {
  const { ctx, store } = setup()

  const result = await runOp('CreateTopic', { Name: 'NewTopic' }, ctx)

  expect(result.TopicArn).toBe('arn:aws:sns:us-east-1:000000000000:NewTopic')
  expect(store.getTopicByArn(result.TopicArn)).toBeDefined()
})

it('CreateTopic is idempotent — re-creating returns the same ARN', async () => {
  const { ctx } = setup()

  const first = await runOp('CreateTopic', { Name: 'NewTopic' }, ctx)
  const second = await runOp('CreateTopic', { Name: 'NewTopic' }, ctx)

  expect(second.TopicArn).toBe(first.TopicArn)
})

it('CreateTopic with a .fifo suffix marks the topic FIFO', async () => {
  const { ctx, store } = setup()

  const result = await runOp('CreateTopic', { Name: 'Orders.fifo' }, ctx)

  expect(store.getTopicByArn(result.TopicArn).fifo).toBe(true)
})

it('CreateTopic without a Name throws InvalidParameter (400)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() => runOp('CreateTopic', {}, ctx))

  expect(err).toBeInstanceOf(SnsOpError)
  expect(err.awsCode).toBe('InvalidParameter')
  expect(err.httpStatus).toBe(400)
})

// ---------------------------------------------------------------------------
// DeleteTopic / ListTopics
// ---------------------------------------------------------------------------

it('DeleteTopic removes the topic', async () => {
  const { ctx, store } = setup()

  await runOp('DeleteTopic', { TopicArn: TOPIC_ARN }, ctx)

  expect(store.getTopicByArn(TOPIC_ARN)).toBeUndefined()
})

it('ListTopics returns every topic as { TopicArn }', async () => {
  const { ctx } = setup()

  const result = await runOp('ListTopics', {}, ctx)

  expect(result.Topics).toEqual([{ TopicArn: TOPIC_ARN }])
})

// ---------------------------------------------------------------------------
// Subscribe — target resolution
// ---------------------------------------------------------------------------

it('Subscribe with protocol lambda resolves the target to the functionKey', async () => {
  const { ctx, store } = setup()

  const result = await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'lambda', Endpoint: LAMBDA_ARN },
    ctx,
  )

  const sub = store.getSubscription(result.SubscriptionArn)
  expect(sub.target).toEqual({ kind: 'lambda', functionKey: 'myFn' })
})

it('Subscribe with protocol sqs resolves the target to the queue url', async () => {
  const { ctx, store } = setup()

  const result = await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'sqs', Endpoint: QUEUE_ARN },
    ctx,
  )

  const sub = store.getSubscription(result.SubscriptionArn)
  expect(sub.target).toEqual({ kind: 'sqs', queueUrl: QUEUE_URL })
})

it('Subscribe with an unsupported protocol stores an unsupported target', async () => {
  const { ctx, store } = setup()

  const result = await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'email', Endpoint: 'a@b.com' },
    ctx,
  )

  const sub = store.getSubscription(result.SubscriptionArn)
  expect(sub.target).toEqual({ kind: 'unsupported', protocol: 'email' })
})

it('Subscribe with a lambda endpoint that matches no function stores an unsupported target', async () => {
  const { ctx, store } = setup()

  const result = await runOp(
    'Subscribe',
    {
      TopicArn: TOPIC_ARN,
      Protocol: 'lambda',
      Endpoint: 'arn:aws:lambda:us-east-1:000000000000:function:ghost',
    },
    ctx,
  )

  const sub = store.getSubscription(result.SubscriptionArn)
  expect(sub.target.kind).toBe('unsupported')
})

it('Subscribe pulls FilterPolicy / scope / RawMessageDelivery from Attributes', async () => {
  const { ctx, store } = setup()

  const result = await runOp(
    'Subscribe',
    {
      TopicArn: TOPIC_ARN,
      Protocol: 'lambda',
      Endpoint: LAMBDA_ARN,
      Attributes: {
        FilterPolicy: JSON.stringify({ color: ['red'] }),
        FilterPolicyScope: 'MessageBody',
        RawMessageDelivery: 'true',
      },
    },
    ctx,
  )

  const sub = store.getSubscription(result.SubscriptionArn)
  expect(sub.filterPolicy).toEqual({ color: ['red'] })
  expect(sub.filterPolicyScope).toBe('MessageBody')
  expect(sub.rawMessageDelivery).toBe(true)
})

it('Subscribe to a non-existent topic throws NotFound (404)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp(
      'Subscribe',
      {
        TopicArn: 'arn:aws:sns:us-east-1:000000000000:Ghost',
        Protocol: 'lambda',
        Endpoint: LAMBDA_ARN,
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('NotFound')
  expect(err.httpStatus).toBe(404)
})

it('Subscribe with a non-object FilterPolicy throws InvalidParameter (400)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp(
      'Subscribe',
      {
        TopicArn: TOPIC_ARN,
        Protocol: 'lambda',
        Endpoint: LAMBDA_ARN,
        Attributes: { FilterPolicy: '"not-an-object"' },
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('InvalidParameter')
  expect(err.httpStatus).toBe(400)
})

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

it('Unsubscribe removes the subscription', async () => {
  const { ctx, store } = setup()
  const { SubscriptionArn } = await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'lambda', Endpoint: LAMBDA_ARN },
    ctx,
  )

  await runOp('Unsubscribe', { SubscriptionArn }, ctx)

  expect(store.getSubscription(SubscriptionArn)).toBeUndefined()
})

// ---------------------------------------------------------------------------
// ListSubscriptions / ListSubscriptionsByTopic
// ---------------------------------------------------------------------------

it('ListSubscriptions returns the AWS subscription shape', async () => {
  const { ctx } = setup()
  await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'lambda', Endpoint: LAMBDA_ARN },
    ctx,
  )

  const result = await runOp('ListSubscriptions', {}, ctx)

  expect(result.Subscriptions).toHaveLength(1)
  expect(result.Subscriptions[0]).toEqual({
    SubscriptionArn: expect.any(String),
    TopicArn: TOPIC_ARN,
    Protocol: 'lambda',
    Endpoint: LAMBDA_ARN,
    Owner: '000000000000',
  })
})

it('ListSubscriptionsByTopic only returns the given topic subscriptions', async () => {
  const { ctx, store } = setup()
  store.ensureTopic('arn:aws:sns:us-east-1:000000000000:Other', {
    name: 'Other',
  })
  await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'lambda', Endpoint: LAMBDA_ARN },
    ctx,
  )
  await runOp(
    'Subscribe',
    {
      TopicArn: 'arn:aws:sns:us-east-1:000000000000:Other',
      Protocol: 'lambda',
      Endpoint: LAMBDA_ARN,
    },
    ctx,
  )

  const result = await runOp(
    'ListSubscriptionsByTopic',
    { TopicArn: TOPIC_ARN },
    ctx,
  )

  expect(result.Subscriptions).toHaveLength(1)
  expect(result.Subscriptions[0].TopicArn).toBe(TOPIC_ARN)
})

// ---------------------------------------------------------------------------
// Topic / Subscription attributes
// ---------------------------------------------------------------------------

it('GetTopicAttributes returns the topic attribute map', async () => {
  const { ctx } = setup()

  const result = await runOp('GetTopicAttributes', { TopicArn: TOPIC_ARN }, ctx)

  expect(result.Attributes.TopicArn).toBe(TOPIC_ARN)
})

it('SetTopicAttributes updates a single attribute', async () => {
  const { ctx } = setup()

  await runOp(
    'SetTopicAttributes',
    {
      TopicArn: TOPIC_ARN,
      AttributeName: 'DisplayName',
      AttributeValue: 'Pretty',
    },
    ctx,
  )

  const result = await runOp('GetTopicAttributes', { TopicArn: TOPIC_ARN }, ctx)
  expect(result.Attributes.DisplayName).toBe('Pretty')
})

it('GetSubscriptionAttributes echoes FilterPolicy / scope / RawMessageDelivery', async () => {
  const { ctx } = setup()
  const { SubscriptionArn } = await runOp(
    'Subscribe',
    {
      TopicArn: TOPIC_ARN,
      Protocol: 'lambda',
      Endpoint: LAMBDA_ARN,
      Attributes: {
        FilterPolicy: JSON.stringify({ color: ['red'] }),
        RawMessageDelivery: 'true',
      },
    },
    ctx,
  )

  const result = await runOp(
    'GetSubscriptionAttributes',
    { SubscriptionArn },
    ctx,
  )

  expect(result.Attributes.FilterPolicy).toBe('{"color":["red"]}')
  expect(result.Attributes.RawMessageDelivery).toBe('true')
})

it('SetSubscriptionAttributes updates the FilterPolicy', async () => {
  const { ctx } = setup()
  const { SubscriptionArn } = await runOp(
    'Subscribe',
    { TopicArn: TOPIC_ARN, Protocol: 'lambda', Endpoint: LAMBDA_ARN },
    ctx,
  )

  await runOp(
    'SetSubscriptionAttributes',
    {
      SubscriptionArn,
      AttributeName: 'FilterPolicy',
      AttributeValue: JSON.stringify({ size: ['L'] }),
    },
    ctx,
  )

  const result = await runOp(
    'GetSubscriptionAttributes',
    { SubscriptionArn },
    ctx,
  )
  expect(result.Attributes.FilterPolicy).toBe('{"size":["L"]}')
})

// ---------------------------------------------------------------------------
// ConfirmSubscription
// ---------------------------------------------------------------------------

it('ConfirmSubscription is a no-op success echoing a subscription ARN', async () => {
  const { ctx } = setup()

  const result = await runOp(
    'ConfirmSubscription',
    { TopicArn: TOPIC_ARN, Token: 'tok' },
    ctx,
  )

  expect(result.SubscriptionArn).toEqual(expect.any(String))
})

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

it('Publish returns a MessageId and calls deliver with the record', async () => {
  const { ctx, delivered } = setup()

  const result = await runOp(
    'Publish',
    { TopicArn: TOPIC_ARN, Message: 'hello', Subject: 'hi' },
    ctx,
  )

  expect(result.MessageId).toEqual(expect.any(String))
  expect(delivered).toHaveLength(1)
  expect(delivered[0].topicArn).toBe(TOPIC_ARN)
  expect(delivered[0].record.message).toBe('hello')
  expect(delivered[0].record.subject).toBe('hi')
  expect(delivered[0].record.messageId).toBe(result.MessageId)
})

it('Publish carries MessageAttributes into the delivered record', async () => {
  const { ctx, delivered } = setup()

  await runOp(
    'Publish',
    {
      TopicArn: TOPIC_ARN,
      Message: 'hello',
      MessageAttributes: {
        color: { DataType: 'String', StringValue: 'red' },
      },
    },
    ctx,
  )

  expect(delivered[0].record.messageAttributes).toEqual({
    color: { DataType: 'String', StringValue: 'red' },
  })
})

it('Publish accepts a TargetArn in place of a TopicArn', async () => {
  const { ctx, delivered } = setup()

  const result = await runOp(
    'Publish',
    { TargetArn: TOPIC_ARN, Message: 'hello' },
    ctx,
  )

  expect(result.MessageId).toEqual(expect.any(String))
  expect(delivered[0].topicArn).toBe(TOPIC_ARN)
})

it('Publish to a non-existent topic throws NotFound (404)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp(
      'Publish',
      {
        TopicArn: 'arn:aws:sns:us-east-1:000000000000:Ghost',
        Message: 'x',
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('NotFound')
  expect(err.httpStatus).toBe(404)
})

it('Publish without a Message throws InvalidParameter (400)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp('Publish', { TopicArn: TOPIC_ARN }, ctx),
  )

  expect(err.awsCode).toBe('InvalidParameter')
  expect(err.httpStatus).toBe(400)
})

it('Publish to a FIFO topic without MessageGroupId throws InvalidParameter (400)', async () => {
  const { ctx } = setup({ fifo: true })

  const err = await catchOpError(() =>
    runOp('Publish', { TopicArn: FIFO_TOPIC_ARN, Message: 'x' }, ctx),
  )

  expect(err.awsCode).toBe('InvalidParameter')
  expect(err.httpStatus).toBe(400)
})

it('Publish to a FIFO topic with a MessageGroupId succeeds and carries the group', async () => {
  const { ctx, delivered } = setup({ fifo: true })

  const result = await runOp(
    'Publish',
    { TopicArn: FIFO_TOPIC_ARN, Message: 'x', MessageGroupId: 'g1' },
    ctx,
  )

  expect(result.MessageId).toEqual(expect.any(String))
  expect(delivered[0].record.messageGroupId).toBe('g1')
})

it('Publish to a FIFO topic carries the MessageDeduplicationId on the record', async () => {
  const { ctx, delivered } = setup({ fifo: true })

  await runOp(
    'Publish',
    {
      TopicArn: FIFO_TOPIC_ARN,
      Message: 'x',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd1',
    },
    ctx,
  )

  expect(delivered[0].record.messageDeduplicationId).toBe('d1')
})

it('Publish suppresses a duplicate MessageDeduplicationId within the window', async () => {
  const { ctx, delivered } = setup({ fifo: true })

  const first = await runOp(
    'Publish',
    {
      TopicArn: FIFO_TOPIC_ARN,
      Message: 'x',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd1',
    },
    ctx,
  )
  const second = await runOp(
    'Publish',
    {
      TopicArn: FIFO_TOPIC_ARN,
      Message: 'y',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd1',
    },
    ctx,
  )

  // The duplicate is suppressed: deliver runs once and the original id echoes.
  expect(delivered).toHaveLength(1)
  expect(second.MessageId).toBe(first.MessageId)
})

it('Publish with ContentBasedDeduplication suppresses identical bodies', async () => {
  const { ctx, delivered } = setup({ fifo: true, contentBasedDedup: true })

  const first = await runOp(
    'Publish',
    { TopicArn: FIFO_TOPIC_ARN, Message: 'same-body', MessageGroupId: 'g1' },
    ctx,
  )
  const second = await runOp(
    'Publish',
    { TopicArn: FIFO_TOPIC_ARN, Message: 'same-body', MessageGroupId: 'g1' },
    ctx,
  )

  expect(delivered).toHaveLength(1)
  expect(second.MessageId).toBe(first.MessageId)
})

it('Publish to a FIFO topic delivers distinct dedup ids normally', async () => {
  const { ctx, delivered } = setup({ fifo: true })

  await runOp(
    'Publish',
    {
      TopicArn: FIFO_TOPIC_ARN,
      Message: 'x',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd1',
    },
    ctx,
  )
  await runOp(
    'Publish',
    {
      TopicArn: FIFO_TOPIC_ARN,
      Message: 'y',
      MessageGroupId: 'g1',
      MessageDeduplicationId: 'd2',
    },
    ctx,
  )

  expect(delivered).toHaveLength(2)
})

it('Publish to a non-FIFO topic ignores deduplication entirely', async () => {
  const { ctx, delivered } = setup()

  await runOp(
    'Publish',
    { TopicArn: TOPIC_ARN, Message: 'x', MessageDeduplicationId: 'd1' },
    ctx,
  )
  await runOp(
    'Publish',
    { TopicArn: TOPIC_ARN, Message: 'x', MessageDeduplicationId: 'd1' },
    ctx,
  )

  expect(delivered).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// PublishBatch
// ---------------------------------------------------------------------------

it('PublishBatch publishes each entry and returns Successful entries', async () => {
  const { ctx, delivered } = setup()

  const result = await runOp(
    'PublishBatch',
    {
      TopicArn: TOPIC_ARN,
      PublishBatchRequestEntries: [
        { Id: 'a', Message: 'one' },
        { Id: 'b', Message: 'two' },
      ],
    },
    ctx,
  )

  expect(result.Successful).toHaveLength(2)
  expect(result.Successful[0]).toEqual({
    Id: 'a',
    MessageId: expect.any(String),
  })
  expect(result.Failed).toHaveLength(0)
  expect(delivered).toHaveLength(2)
})

it('PublishBatch reports a missing Message as a Failed entry', async () => {
  const { ctx } = setup()

  const result = await runOp(
    'PublishBatch',
    {
      TopicArn: TOPIC_ARN,
      PublishBatchRequestEntries: [{ Id: 'a' }],
    },
    ctx,
  )

  expect(result.Successful).toHaveLength(0)
  expect(result.Failed).toHaveLength(1)
  expect(result.Failed[0]).toMatchObject({
    Id: 'a',
    SenderFault: true,
  })
})

it('PublishBatch with no entries throws EmptyBatchRequest (400)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp(
      'PublishBatch',
      { TopicArn: TOPIC_ARN, PublishBatchRequestEntries: [] },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('EmptyBatchRequest')
  expect(err.httpStatus).toBe(400)
})

it('PublishBatch with more than 10 entries throws TooManyEntriesInBatchRequest (400)', async () => {
  const { ctx } = setup()
  const entries = Array.from({ length: 11 }, (_, i) => ({
    Id: String(i),
    Message: 'm',
  }))

  const err = await catchOpError(() =>
    runOp(
      'PublishBatch',
      { TopicArn: TOPIC_ARN, PublishBatchRequestEntries: entries },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('TooManyEntriesInBatchRequest')
  expect(err.httpStatus).toBe(400)
})

it('PublishBatch to a non-existent topic throws NotFound (404)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() =>
    runOp(
      'PublishBatch',
      {
        TopicArn: 'arn:aws:sns:us-east-1:000000000000:Ghost',
        PublishBatchRequestEntries: [{ Id: 'a', Message: 'm' }],
      },
      ctx,
    ),
  )

  expect(err.awsCode).toBe('NotFound')
  expect(err.httpStatus).toBe(404)
})

// ---------------------------------------------------------------------------
// Unknown action
// ---------------------------------------------------------------------------

it('an unknown action throws InvalidAction (400)', async () => {
  const { ctx } = setup()

  const err = await catchOpError(() => runOp('FrobnicateTopic', {}, ctx))

  expect(err).toBeInstanceOf(SnsOpError)
  expect(err.awsCode).toBe('InvalidAction')
  expect(err.httpStatus).toBe(400)
})
