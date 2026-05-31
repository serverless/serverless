import { jest } from '@jest/globals'
import { createEbDeliverer } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/delivery.js'
import { createBusStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/bus-store.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a stub logger that silently records every call.
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
 * Build a stub Lambda facade whose `invoke` is a recorded async function. The
 * returned object exposes `getLambdaFunction` (keyed by functionKey) and the
 * `invokes` array of `{ functionKey, event, options }` captured per call.
 */
function makeLambdas() {
  const invokes = []
  const getLambdaFunction = (functionKey) => ({
    invoke: jest.fn(async (event, options) => {
      invokes.push({ functionKey, event, options })
    }),
  })
  return { getLambdaFunction, invokes }
}

/** A minimal EventBridge event used across the cases. */
const EVENT = {
  version: '0',
  id: 'evt-1',
  'detail-type': 'order.created',
  source: 'shop.orders',
  account: '000000000000',
  time: '2026-05-31T00:00:00Z',
  region: 'us-east-1',
  resources: [],
  detail: { orderId: 'o-1', total: 42 },
  'event-bus-name': 'default',
}

/**
 * Seed a store with one ENABLED rule on `default` that matches the EVENT, then
 * attach the given targets (already in the resolved store shape).
 */
function seedMatchingRule(store, targets) {
  store.putRule('default', 'orders-rule', {
    eventPattern: { source: ['shop.orders'] },
  })
  store.putTargets('default', 'orders-rule', targets.map(toRaw))
  // Mirror what ops.PutTargets / eb-wiring fills in: kind + resolved.
  const stored = store.listTargetsByRule('default', 'orders-rule')
  stored.forEach((target, i) => {
    target.kind = targets[i].kind
    target.resolved = targets[i].resolved
  })
}

/** Convert a friendly target spec into a raw PutTargets entry. */
function toRaw(t) {
  return {
    Id: t.id,
    Arn: t.arn ?? `arn:aws:${t.kind}:us-east-1:000000000000:x`,
    Input: t.input,
    InputPath: t.inputPath,
    InputTransformer: t.inputTransformer,
  }
}

// ---------------------------------------------------------------------------
// Lambda targets
// ---------------------------------------------------------------------------

it('invokes a matching rule lambda target with the event, async', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  seedMatchingRule(store, [
    { id: 'fn', kind: 'lambda', resolved: { functionKey: 'handler' } },
  ])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes).toHaveLength(1)
  expect(invokes[0].functionKey).toBe('handler')
  expect(invokes[0].event).toEqual(EVENT)
  expect(invokes[0].options).toEqual({ async: true })
})

it('applies the target input transform before invoking the lambda', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  seedMatchingRule(store, [
    {
      id: 'fn',
      kind: 'lambda',
      resolved: { functionKey: 'handler' },
      input: JSON.stringify({ fixed: true }),
    },
  ])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes[0].event).toEqual({ fixed: true })
})

it('does not invoke a target when the rule pattern does not match', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  store.putRule('default', 'other-rule', {
    eventPattern: { source: ['some.other.source'] },
  })
  store.putTargets('default', 'other-rule', [
    { Id: 'fn', Arn: 'arn:aws:lambda:us-east-1:000000000000:function:h' },
  ])
  for (const target of store.listTargetsByRule('default', 'other-rule')) {
    target.kind = 'lambda'
    target.resolved = { functionKey: 'handler' }
  }
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes).toHaveLength(0)
})

it('skips a DISABLED rule', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  store.putRule('default', 'orders-rule', {
    eventPattern: { source: ['shop.orders'] },
    state: 'DISABLED',
  })
  store.putTargets('default', 'orders-rule', [
    { Id: 'fn', Arn: 'arn:aws:lambda:us-east-1:000000000000:function:h' },
  ])
  for (const target of store.listTargetsByRule('default', 'orders-rule')) {
    target.kind = 'lambda'
    target.resolved = { functionKey: 'handler' }
  }
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes).toHaveLength(0)
})

it('skips a schedule-only rule (no event pattern)', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  store.putRule('default', 'cron-rule', {
    scheduleExpression: 'rate(1 minute)',
  })
  store.putTargets('default', 'cron-rule', [
    { Id: 'fn', Arn: 'arn:aws:lambda:us-east-1:000000000000:function:h' },
  ])
  for (const target of store.listTargetsByRule('default', 'cron-rule')) {
    target.kind = 'lambda'
    target.resolved = { functionKey: 'handler' }
  }
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// SQS targets
// ---------------------------------------------------------------------------

it('sends a stringified payload to an SQS target', async () => {
  const store = createBusStore()
  const { getLambdaFunction } = makeLambdas()
  const send = jest.fn()
  seedMatchingRule(store, [
    {
      id: 'q',
      kind: 'sqs',
      resolved: { queueUrl: 'http://localhost/000000000000/orders' },
    },
  ])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(send).toHaveBeenCalledTimes(1)
  const [url, payload] = send.mock.calls[0]
  expect(url).toBe('http://localhost/000000000000/orders')
  expect(payload.body).toBe(JSON.stringify(EVENT))
  expect(payload.messageAttributes).toEqual({})
})

it('passes a string Input payload to SQS verbatim (not double-encoded)', async () => {
  const store = createBusStore()
  const { getLambdaFunction } = makeLambdas()
  const send = jest.fn()
  seedMatchingRule(store, [
    {
      id: 'q',
      kind: 'sqs',
      resolved: { queueUrl: 'http://localhost/q' },
      // A non-JSON Input string is delivered verbatim by applyInputTransform.
      input: 'plain text',
    },
  ])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(send.mock.calls[0][1].body).toBe('plain text')
})

// ---------------------------------------------------------------------------
// SNS targets
// ---------------------------------------------------------------------------

it('publishes a stringified payload to an SNS target', async () => {
  const store = createBusStore()
  const { getLambdaFunction } = makeLambdas()
  const snsPublish = jest.fn()
  seedMatchingRule(store, [
    {
      id: 't',
      kind: 'sns',
      resolved: { topicArn: 'arn:aws:sns:us-east-1:000000000000:orders' },
    },
  ])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish,
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(snsPublish).toHaveBeenCalledTimes(1)
  expect(snsPublish).toHaveBeenCalledWith(
    'arn:aws:sns:us-east-1:000000000000:orders',
    JSON.stringify(EVENT),
  )
})

// ---------------------------------------------------------------------------
// Cross-bus targets
// ---------------------------------------------------------------------------

it('recursively delivers to a cross-bus target', async () => {
  const store = createBusStore()
  const { getLambdaFunction, invokes } = makeLambdas()
  // default → forwards to "downstream"; downstream → invokes a lambda.
  store.putRule('default', 'fanout', {
    eventPattern: { source: ['shop.orders'] },
  })
  store.putTargets('default', 'fanout', [
    {
      Id: 'bus',
      Arn: 'arn:aws:events:us-east-1:000000000000:event-bus/downstream',
    },
  ])
  for (const target of store.listTargetsByRule('default', 'fanout')) {
    target.kind = 'eventbus'
    target.resolved = { busName: 'downstream' }
  }
  store.putRule('downstream', 'sink', {
    eventPattern: { source: ['shop.orders'] },
  })
  store.putTargets('downstream', 'sink', [
    { Id: 'fn', Arn: 'arn:aws:lambda:us-east-1:000000000000:function:h' },
  ])
  for (const target of store.listTargetsByRule('downstream', 'sink')) {
    target.kind = 'lambda'
    target.resolved = { functionKey: 'downstreamHandler' }
  }

  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger: makeLogger(),
  })

  await deliverer.deliver('default', EVENT)

  expect(invokes).toHaveLength(1)
  expect(invokes[0].functionKey).toBe('downstreamHandler')
})

it('stops a self-referential cross-bus loop at the depth guard', async () => {
  const store = createBusStore()
  const { getLambdaFunction } = makeLambdas()
  // The default bus forwards every matching event back to itself.
  store.putRule('default', 'loop', {
    eventPattern: { source: ['shop.orders'] },
  })
  store.putTargets('default', 'loop', [
    {
      Id: 'self',
      Arn: 'arn:aws:events:us-east-1:000000000000:event-bus/default',
    },
  ])
  for (const target of store.listTargetsByRule('default', 'loop')) {
    target.kind = 'eventbus'
    target.resolved = { busName: 'default' }
  }
  const logger = makeLogger()
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger,
    maxDepth: 3,
  })

  // Must terminate (no infinite recursion / stack overflow).
  await expect(deliverer.deliver('default', EVENT)).resolves.toBeUndefined()
})

// ---------------------------------------------------------------------------
// Unsupported targets + per-target isolation
// ---------------------------------------------------------------------------

it('skips an unsupported target with a one-time debug note', async () => {
  const store = createBusStore()
  const { getLambdaFunction } = makeLambdas()
  const logger = makeLogger()
  seedMatchingRule(store, [{ id: 'x', kind: 'unsupported', resolved: null }])
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send: jest.fn() },
    snsPublish: jest.fn(),
    logger,
  })

  await deliverer.deliver('default', EVENT)

  expect(logger.debug).toHaveBeenCalled()
})

it('isolates a throwing target so a sibling target still fires', async () => {
  const store = createBusStore()
  const invokes = []
  const getLambdaFunction = (functionKey) => ({
    invoke: jest.fn(async (event) => {
      invokes.push({ functionKey, event })
    }),
  })
  const send = jest.fn(() => {
    throw new Error('sqs blew up')
  })
  seedMatchingRule(store, [
    { id: 'q', kind: 'sqs', resolved: { queueUrl: 'http://localhost/q' } },
    { id: 'fn', kind: 'lambda', resolved: { functionKey: 'handler' } },
  ])
  const logger = makeLogger()
  const deliverer = createEbDeliverer({
    store,
    getLambdaFunction,
    queueStore: { send },
    snsPublish: jest.fn(),
    logger,
  })

  await deliverer.deliver('default', EVENT)

  // The SQS target threw, but the lambda sibling still fired.
  expect(invokes).toHaveLength(1)
  expect(invokes[0].functionKey).toBe('handler')
  expect(logger.error).toHaveBeenCalled()
})
