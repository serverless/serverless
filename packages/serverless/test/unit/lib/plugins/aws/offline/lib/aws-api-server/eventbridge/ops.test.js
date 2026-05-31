import {
  runOp,
  EbOpError,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/ops.js'
import { createBusStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/bus-store.js'
import {
  createRegistry,
  registerLambda,
  registerSqsQueue,
  registerSnsTopic,
  registerEventResource,
} from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a context with a fresh store, a registry pre-loaded with one of each
 * resource kind, and a deliver spy that records its calls.
 *
 * @returns {{ store, registry, deliver, delivered: Array<{ busName: string, event: object }> }}
 */
function setup() {
  const store = createBusStore()
  const registry = createRegistry()

  registerLambda(registry, {
    logicalId: 'Worker',
    functionKey: 'worker',
    name: 'svc-dev-worker',
    arn: 'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-worker',
  })
  registerSqsQueue(registry, {
    logicalId: 'Jobs',
    name: 'jobs',
    arn: 'arn:aws:sqs:us-east-1:000000000000:jobs',
    url: 'http://localhost:3002/000000000000/jobs',
    properties: {},
  })
  registerSnsTopic(registry, {
    logicalId: 'Alerts',
    name: 'alerts',
    arn: 'arn:aws:sns:us-east-1:000000000000:alerts',
  })
  registerEventResource(registry, {
    logicalId: 'OrdersBus',
    name: 'orders',
    arn: 'arn:aws:events:us-east-1:000000000000:event-bus/orders',
    kind: 'bus',
    properties: {},
  })

  const delivered = []
  const deliver = async (busName, event) => {
    delivered.push({ busName, event })
  }

  return { store, registry, deliver, delivered }
}

/** Run an op with the shared context. */
function run(action, params, ctx) {
  return runOp(action, params, ctx)
}

// ===========================================================================
// PutEvents
// ===========================================================================

it('1. PutEvents builds the EB event and calls deliver, returning an EventId', async () => {
  const ctx = setup()
  const result = await run(
    'PutEvents',
    {
      Entries: [
        {
          Source: 'shop.orders',
          DetailType: 'order placed',
          Detail: JSON.stringify({ orderId: 'o-1' }),
        },
      ],
    },
    ctx,
  )

  expect(result.FailedEntryCount).toBe(0)
  expect(result.Entries).toHaveLength(1)
  expect(result.Entries[0].EventId).toEqual(expect.any(String))

  expect(ctx.delivered).toHaveLength(1)
  const { busName, event } = ctx.delivered[0]
  expect(busName).toBe('default')
  expect(event).toMatchObject({
    version: '0',
    'detail-type': 'order placed',
    source: 'shop.orders',
    account: '000000000000',
    region: 'us-east-1',
    resources: [],
    detail: { orderId: 'o-1' },
    'event-bus-name': 'default',
  })
  expect(event.id).toBe(result.Entries[0].EventId)
  expect(typeof event.time).toBe('string')
})

it('2. PutEvents honours EventBusName, Resources and Time', async () => {
  const ctx = setup()
  await run(
    'PutEvents',
    {
      Entries: [
        {
          Source: 's',
          DetailType: 'd',
          Detail: '{}',
          EventBusName: 'orders',
          Resources: ['arn:aws:x'],
          Time: '2026-01-01T00:00:00Z',
        },
      ],
    },
    ctx,
  )
  const { busName, event } = ctx.delivered[0]
  expect(busName).toBe('orders')
  expect(event.resources).toEqual(['arn:aws:x'])
  expect(event.time).toBe('2026-01-01T00:00:00Z')
  expect(event['event-bus-name']).toBe('orders')
})

it('3. PutEvents defaults Detail to {} when absent', async () => {
  const ctx = setup()
  await run('PutEvents', { Entries: [{ Source: 's', DetailType: 'd' }] }, ctx)
  expect(ctx.delivered[0].event.detail).toEqual({})
})

it('4. PutEvents reports a malformed Detail as a failed entry', async () => {
  const ctx = setup()
  const result = await run(
    'PutEvents',
    {
      Entries: [
        { Source: 'ok', DetailType: 'd', Detail: '{}' },
        { Source: 'bad', DetailType: 'd', Detail: '{not json' },
      ],
    },
    ctx,
  )
  expect(result.FailedEntryCount).toBe(1)
  expect(result.Entries).toHaveLength(2)
  expect(result.Entries[0].EventId).toEqual(expect.any(String))
  expect(result.Entries[1].ErrorCode).toBeDefined()
  expect(result.Entries[1].EventId).toBeUndefined()
  // Only the good entry was delivered.
  expect(ctx.delivered).toHaveLength(1)
  expect(ctx.delivered[0].event.source).toBe('ok')
})

// ===========================================================================
// Rules
// ===========================================================================

it('5. PutRule creates a rule and returns its ARN', () => {
  const ctx = setup()
  const result = run(
    'PutRule',
    { Name: 'r1', EventPattern: JSON.stringify({ source: ['s'] }) },
    ctx,
  )
  expect(result.RuleArn).toBe('arn:aws:events:us-east-1:000000000000:rule/r1')
})

it('6. DescribeRule returns Name/Arn/EventPattern/State/EventBusName', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1', EventPattern: '{"source":["s"]}' }, ctx)
  const result = run('DescribeRule', { Name: 'r1' }, ctx)
  expect(result).toMatchObject({
    Name: 'r1',
    Arn: 'arn:aws:events:us-east-1:000000000000:rule/r1',
    EventPattern: '{"source":["s"]}',
    State: 'ENABLED',
    EventBusName: 'default',
  })
})

it('7. ListRules lists rules, filtered by NamePrefix', () => {
  const ctx = setup()
  run('PutRule', { Name: 'order-a' }, ctx)
  run('PutRule', { Name: 'order-b' }, ctx)
  run('PutRule', { Name: 'ship-c' }, ctx)
  const all = run('ListRules', {}, ctx)
  expect(all.Rules.map((r) => r.Name).sort()).toEqual([
    'order-a',
    'order-b',
    'ship-c',
  ])
  const filtered = run('ListRules', { NamePrefix: 'order' }, ctx)
  expect(filtered.Rules.map((r) => r.Name).sort()).toEqual([
    'order-a',
    'order-b',
  ])
})

it('8. EnableRule / DisableRule flip the rule state', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1', State: 'ENABLED' }, ctx)
  run('DisableRule', { Name: 'r1' }, ctx)
  expect(run('DescribeRule', { Name: 'r1' }, ctx).State).toBe('DISABLED')
  run('EnableRule', { Name: 'r1' }, ctx)
  expect(run('DescribeRule', { Name: 'r1' }, ctx).State).toBe('ENABLED')
})

it('9. DeleteRule removes the rule', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  run('DeleteRule', { Name: 'r1' }, ctx)
  expect(() => run('DescribeRule', { Name: 'r1' }, ctx)).toThrow(EbOpError)
})

it('10. DescribeRule on an unknown rule throws ResourceNotFoundException (404)', () => {
  const ctx = setup()
  try {
    run('DescribeRule', { Name: 'nope' }, ctx)
    throw new Error('should have thrown')
  } catch (error) {
    expect(error).toBeInstanceOf(EbOpError)
    expect(error.awsCode).toBe('ResourceNotFoundException')
    expect(error.httpStatus).toBe(404)
  }
})

it('11. PutRule with a malformed EventPattern throws InvalidEventPatternException', () => {
  const ctx = setup()
  try {
    run('PutRule', { Name: 'r1', EventPattern: '{not json' }, ctx)
    throw new Error('should have thrown')
  } catch (error) {
    expect(error).toBeInstanceOf(EbOpError)
    expect(error.awsCode).toBe('InvalidEventPatternException')
    expect(error.httpStatus).toBe(400)
  }
})

// ===========================================================================
// Targets
// ===========================================================================

it('12. PutTargets resolves a lambda arn to kind lambda', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  const result = run(
    'PutTargets',
    {
      Rule: 'r1',
      Targets: [
        {
          Id: 't1',
          Arn: 'arn:aws:lambda:us-east-1:000000000000:function:svc-dev-worker',
        },
      ],
    },
    ctx,
  )
  expect(result).toEqual({ FailedEntryCount: 0, FailedEntries: [] })
  const [target] = ctx.store.listTargetsByRule('default', 'r1')
  expect(target.kind).toBe('lambda')
  expect(target.resolved).toMatchObject({ functionKey: 'worker' })
})

it('13. PutTargets resolves sqs / sns / eventbus / unsupported kinds', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  run(
    'PutTargets',
    {
      Rule: 'r1',
      Targets: [
        { Id: 'q', Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs' },
        { Id: 'n', Arn: 'arn:aws:sns:us-east-1:000000000000:alerts' },
        {
          Id: 'b',
          Arn: 'arn:aws:events:us-east-1:000000000000:event-bus/orders',
        },
        { Id: 'x', Arn: 'arn:aws:dynamodb:us-east-1:000000000000:table/T' },
      ],
    },
    ctx,
  )
  const byId = Object.fromEntries(
    ctx.store.listTargetsByRule('default', 'r1').map((t) => [t.id, t]),
  )
  expect(byId.q.kind).toBe('sqs')
  expect(byId.q.resolved).toMatchObject({
    queueUrl: 'http://localhost:3002/000000000000/jobs',
  })
  expect(byId.n.kind).toBe('sns')
  expect(byId.n.resolved).toMatchObject({
    topicArn: 'arn:aws:sns:us-east-1:000000000000:alerts',
  })
  expect(byId.b.kind).toBe('eventbus')
  expect(byId.b.resolved).toMatchObject({ busName: 'orders' })
  expect(byId.x.kind).toBe('unsupported')
})

it('14. PutTargets persists Input/InputPath/InputTransformer', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  run(
    'PutTargets',
    {
      Rule: 'r1',
      Targets: [
        {
          Id: 't1',
          Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs',
          InputPath: '$.detail',
        },
      ],
    },
    ctx,
  )
  const [target] = ctx.store.listTargetsByRule('default', 'r1')
  expect(target.inputPath).toBe('$.detail')
})

it('15. ListTargetsByRule returns Id/Arn/Input/InputPath/InputTransformer', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  run(
    'PutTargets',
    {
      Rule: 'r1',
      Targets: [
        {
          Id: 't1',
          Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs',
          Input: '{"k":1}',
        },
      ],
    },
    ctx,
  )
  const result = run('ListTargetsByRule', { Rule: 'r1' }, ctx)
  expect(result.Targets).toEqual([
    {
      Id: 't1',
      Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs',
      Input: '{"k":1}',
      InputPath: null,
      InputTransformer: null,
    },
  ])
})

it('16. RemoveTargets drops a target by id', () => {
  const ctx = setup()
  run('PutRule', { Name: 'r1' }, ctx)
  run(
    'PutTargets',
    {
      Rule: 'r1',
      Targets: [{ Id: 't1', Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs' }],
    },
    ctx,
  )
  const result = run('RemoveTargets', { Rule: 'r1', Ids: ['t1'] }, ctx)
  expect(result).toEqual({ FailedEntryCount: 0, FailedEntries: [] })
  expect(ctx.store.listTargetsByRule('default', 'r1')).toHaveLength(0)
})

it('17. PutTargets on an unknown rule throws ResourceNotFoundException', () => {
  const ctx = setup()
  expect(() =>
    run(
      'PutTargets',
      {
        Rule: 'ghost',
        Targets: [{ Id: 't', Arn: 'arn:aws:sqs:us-east-1:000000000000:jobs' }],
      },
      ctx,
    ),
  ).toThrow(EbOpError)
})

// ===========================================================================
// Buses
// ===========================================================================

it('18. CreateEventBus returns the bus ARN and DeleteEventBus removes it', () => {
  const ctx = setup()
  const result = run('CreateEventBus', { Name: 'billing' }, ctx)
  expect(result.EventBusArn).toBe(
    'arn:aws:events:us-east-1:000000000000:event-bus/billing',
  )
  expect(ctx.store.getBus('billing')).toBeDefined()
  run('DeleteEventBus', { Name: 'billing' }, ctx)
  expect(ctx.store.getBus('billing')).toBeUndefined()
})

it('19. ListEventBuses returns Name/Arn entries including the default bus', () => {
  const ctx = setup()
  run('CreateEventBus', { Name: 'billing' }, ctx)
  const result = run('ListEventBuses', {}, ctx)
  const names = result.EventBuses.map((b) => b.Name)
  expect(names).toContain('default')
  expect(names).toContain('billing')
  const billing = result.EventBuses.find((b) => b.Name === 'billing')
  expect(billing.Arn).toBe(
    'arn:aws:events:us-east-1:000000000000:event-bus/billing',
  )
})

// ===========================================================================
// TestEventPattern
// ===========================================================================

it('20. TestEventPattern returns true for a matching event', () => {
  const ctx = setup()
  const result = run(
    'TestEventPattern',
    {
      EventPattern: JSON.stringify({ source: ['shop.orders'] }),
      Event: JSON.stringify({ source: 'shop.orders', 'detail-type': 'x' }),
    },
    ctx,
  )
  expect(result).toEqual({ Result: true })
})

it('21. TestEventPattern returns false for a non-matching event', () => {
  const ctx = setup()
  const result = run(
    'TestEventPattern',
    {
      EventPattern: JSON.stringify({ source: ['other'] }),
      Event: JSON.stringify({ source: 'shop.orders' }),
    },
    ctx,
  )
  expect(result).toEqual({ Result: false })
})

// ===========================================================================
// Unknown action
// ===========================================================================

it('22. an unknown action throws', () => {
  const ctx = setup()
  expect(() => run('Frobnicate', {}, ctx)).toThrow()
})
