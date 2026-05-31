import { jest } from '@jest/globals'
import { createTopicStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/topic-store.js'
import { createDeliverer } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/delivery.js'

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:MyTopic'
const QUEUE_URL = 'http://localhost:3002/000000000000/MyQueue'
const FIXED_TIMESTAMP = '2026-05-31T00:00:00.000Z'

/**
 * Flush the microtask queue a few times so any fire-and-forget Lambda invoke
 * (`.invoke().catch(...)`) settles before assertions.
 */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

/**
 * Builds a stub logger that silently discards all messages.
 */
function makeLogger() {
  return {
    info: jest.fn(),
    notice: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }
}

/**
 * Builds a stub Lambda facade whose `.invoke(event)` records each call.
 */
function makeLambdaFn(invokeFn) {
  return { invoke: invokeFn ?? jest.fn().mockResolvedValue(undefined) }
}

/**
 * Build a published-message record in the shape `ops.toPublishRecord` produces.
 */
function makeRecord(overrides = {}) {
  return {
    messageId: 'mid-1',
    message: 'hello world',
    subject: undefined,
    messageAttributes: {},
    ...overrides,
  }
}

test('delivers to a lambda subscriber with the AWS SNS event shape', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const subArn = store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn:aws:lambda:us-east-1:000000000000:function:fn',
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const getLambdaFunction = jest.fn(() => makeLambdaFn(invoke))
  const queueStore = { send: jest.fn() }

  const deliverer = createDeliverer({
    store,
    getLambdaFunction,
    queueStore,
    logger: makeLogger(),
    now: () => FIXED_TIMESTAMP,
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({
      subject: 'Greeting',
      messageAttributes: {
        color: { DataType: 'String', StringValue: 'blue' },
      },
    }),
  )
  await flushMicrotasks()

  expect(getLambdaFunction).toHaveBeenCalledWith('fn')
  expect(invoke).toHaveBeenCalledTimes(1)
  const event = invoke.mock.calls[0][0]
  expect(event.Records).toHaveLength(1)
  const rec = event.Records[0]
  expect(rec.EventSource).toBe('aws:sns')
  expect(rec.EventVersion).toBe('1.0')
  expect(rec.EventSubscriptionArn).toBe(subArn)
  expect(rec.Sns.Type).toBe('Notification')
  expect(rec.Sns.MessageId).toBe('mid-1')
  expect(rec.Sns.TopicArn).toBe(TOPIC_ARN)
  expect(rec.Sns.Subject).toBe('Greeting')
  expect(rec.Sns.Message).toBe('hello world')
  expect(rec.Sns.Timestamp).toBe(FIXED_TIMESTAMP)
  expect(rec.Sns.SignatureVersion).toBe('1')
  expect(rec.Sns.MessageAttributes).toEqual({
    color: { Type: 'String', Value: 'blue' },
  })
})

test('omits the lambda Sns.Subject key when the publish had none', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send: jest.fn() },
    logger: makeLogger(),
    now: () => FIXED_TIMESTAMP,
  })

  await deliverer.deliver(TOPIC_ARN, makeRecord())
  await flushMicrotasks()

  expect('Subject' in invoke.mock.calls[0][0].Records[0].Sns).toBe(false)
})

test('a rejected lambda invoke is logged and does not throw', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const logger = makeLogger()
  const invoke = jest.fn().mockRejectedValue(new Error('boom'))
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send: jest.fn() },
    logger,
  })

  await expect(
    deliverer.deliver(TOPIC_ARN, makeRecord()),
  ).resolves.toBeUndefined()
  await flushMicrotasks()

  expect(logger.error).toHaveBeenCalledTimes(1)
})

test('delivers to an sqs subscriber as the SNS notification envelope', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    endpoint: 'arn:aws:sqs:us-east-1:000000000000:MyQueue',
    target: { kind: 'sqs', queueUrl: QUEUE_URL },
  })

  const send = jest.fn()
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: jest.fn(),
    queueStore: { send },
    logger: makeLogger(),
    now: () => FIXED_TIMESTAMP,
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({
      subject: 'Greeting',
      messageAttributes: {
        color: { DataType: 'String', StringValue: 'blue' },
      },
    }),
  )

  expect(send).toHaveBeenCalledTimes(1)
  const [url, payload] = send.mock.calls[0]
  expect(url).toBe(QUEUE_URL)
  const envelope = JSON.parse(payload.body)
  expect(envelope.Type).toBe('Notification')
  expect(envelope.MessageId).toBe('mid-1')
  expect(envelope.TopicArn).toBe(TOPIC_ARN)
  expect(envelope.Subject).toBe('Greeting')
  expect(envelope.Message).toBe('hello world')
  expect(envelope.Timestamp).toBe(FIXED_TIMESTAMP)
  expect(envelope.SignatureVersion).toBe('1')
  expect(envelope.MessageAttributes).toEqual({
    color: { Type: 'String', Value: 'blue' },
  })
})

test('omits Subject from the sqs envelope when the publish had none', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    endpoint: 'arn',
    target: { kind: 'sqs', queueUrl: QUEUE_URL },
  })

  const send = jest.fn()
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: jest.fn(),
    queueStore: { send },
    logger: makeLogger(),
    now: () => FIXED_TIMESTAMP,
  })

  await deliverer.deliver(TOPIC_ARN, makeRecord())

  const envelope = JSON.parse(send.mock.calls[0][1].body)
  expect('Subject' in envelope).toBe(false)
})

test('raw-message-delivery sends the bare message and passes attributes through', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    endpoint: 'arn',
    rawMessageDelivery: true,
    target: { kind: 'sqs', queueUrl: QUEUE_URL },
  })

  const send = jest.fn()
  const attrs = { color: { DataType: 'String', StringValue: 'blue' } }
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: jest.fn(),
    queueStore: { send },
    logger: makeLogger(),
    now: () => FIXED_TIMESTAMP,
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({ message: 'raw-body', messageAttributes: attrs }),
  )

  const [, payload] = send.mock.calls[0]
  expect(payload.body).toBe('raw-body')
  expect(payload.messageAttributes).toBe(attrs)
})

test('skips a subscriber whose filter policy does not match', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    filterPolicy: { color: ['red'] },
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send: jest.fn() },
    logger: makeLogger(),
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({
      messageAttributes: { color: { DataType: 'String', StringValue: 'blue' } },
    }),
  )
  await flushMicrotasks()

  expect(invoke).not.toHaveBeenCalled()
})

test('delivers to a subscriber whose filter policy matches', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    filterPolicy: { color: ['blue'] },
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send: jest.fn() },
    logger: makeLogger(),
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({
      messageAttributes: { color: { DataType: 'String', StringValue: 'blue' } },
    }),
  )
  await flushMicrotasks()

  expect(invoke).toHaveBeenCalledTimes(1)
})

test('evaluates a MessageBody-scoped filter policy against the message body', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    filterPolicy: { color: ['blue'] },
    filterPolicyScope: 'MessageBody',
    target: { kind: 'lambda', functionKey: 'fn' },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send: jest.fn() },
    logger: makeLogger(),
  })

  await deliverer.deliver(
    TOPIC_ARN,
    makeRecord({ message: JSON.stringify({ color: 'blue' }) }),
  )
  await flushMicrotasks()

  expect(invoke).toHaveBeenCalledTimes(1)
})

test('skips an unsupported target and debug-logs once per protocol', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'email',
    endpoint: 'me@example.com',
    target: { kind: 'unsupported', protocol: 'email' },
  })
  store.subscribe(TOPIC_ARN, {
    protocol: 'email',
    endpoint: 'you@example.com',
    target: { kind: 'unsupported', protocol: 'email' },
  })

  const logger = makeLogger()
  const send = jest.fn()
  const invoke = jest.fn()
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send },
    logger,
  })

  await deliverer.deliver(TOPIC_ARN, makeRecord())
  // Deliver a second message to confirm the debug log stays once-per-protocol.
  await deliverer.deliver(TOPIC_ARN, makeRecord())

  expect(send).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalled()
  expect(logger.debug).toHaveBeenCalledTimes(1)
})

test('delivers to every matching subscriber on the topic', async () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn',
    target: { kind: 'lambda', functionKey: 'fn' },
  })
  store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    endpoint: 'arn',
    target: { kind: 'sqs', queueUrl: QUEUE_URL },
  })

  const invoke = jest.fn().mockResolvedValue(undefined)
  const send = jest.fn()
  const deliverer = createDeliverer({
    store,
    getLambdaFunction: () => makeLambdaFn(invoke),
    queueStore: { send },
    logger: makeLogger(),
  })

  await deliverer.deliver(TOPIC_ARN, makeRecord())
  await flushMicrotasks()

  expect(invoke).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledTimes(1)
})
