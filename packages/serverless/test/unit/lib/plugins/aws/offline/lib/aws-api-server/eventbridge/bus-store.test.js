import { createBusStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/bus-store.js'

// ===========================================================================
// Buses
// ===========================================================================

it('1. the default bus always exists', () => {
  const store = createBusStore()
  const bus = store.getBus('default')
  expect(bus).toBeDefined()
  expect(bus.name).toBe('default')
  expect(bus.arn).toBe(
    'arn:aws:events:us-east-1:000000000000:event-bus/default',
  )
})

it('2. listBuses includes the default bus', () => {
  const store = createBusStore()
  expect(store.listBuses().map((b) => b.name)).toContain('default')
})

it('3. ensureBus creates a new bus and returns { name, arn }', () => {
  const store = createBusStore()
  const bus = store.ensureBus('orders')
  expect(bus.name).toBe('orders')
  expect(bus.arn).toBe('arn:aws:events:us-east-1:000000000000:event-bus/orders')
  expect(store.getBus('orders')).toEqual(bus)
})

it('4. ensureBus is idempotent', () => {
  const store = createBusStore()
  const first = store.ensureBus('orders')
  const second = store.ensureBus('orders')
  expect(second).toEqual(first)
  expect(store.listBuses().filter((b) => b.name === 'orders')).toHaveLength(1)
})

it('5. deleteBus removes a bus', () => {
  const store = createBusStore()
  store.ensureBus('orders')
  store.deleteBus('orders')
  expect(store.getBus('orders')).toBeUndefined()
})

it('6. getBus returns undefined for an unknown bus', () => {
  const store = createBusStore()
  expect(store.getBus('nope')).toBeUndefined()
})

// ===========================================================================
// Rules
// ===========================================================================

it('7. putRule returns the rule ARN', () => {
  const store = createBusStore()
  const arn = store.putRule('default', 'my-rule', {
    eventPattern: { source: ['aws.ec2'] },
  })
  expect(arn).toBe('arn:aws:events:us-east-1:000000000000:rule/my-rule')
})

it('8. putRule defaults state to ENABLED', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  expect(store.describeRule('default', 'my-rule').state).toBe('ENABLED')
})

it('9. putRule is an idempotent overwrite (same name updates in place)', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['a'] } })
  store.putRule('default', 'my-rule', { eventPattern: { source: ['b'] } })
  expect(store.listRules('default')).toHaveLength(1)
  expect(store.describeRule('default', 'my-rule').eventPattern).toEqual({
    source: ['b'],
  })
})

it('10. describeRule returns the stored fields', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', {
    eventPattern: { source: ['aws.ec2'] },
    scheduleExpression: 'rate(5 minutes)',
    state: 'DISABLED',
  })
  const rule = store.describeRule('default', 'my-rule')
  expect(rule).toMatchObject({
    name: 'my-rule',
    busName: 'default',
    eventPattern: { source: ['aws.ec2'] },
    scheduleExpression: 'rate(5 minutes)',
    state: 'DISABLED',
    arn: 'arn:aws:events:us-east-1:000000000000:rule/my-rule',
  })
})

it('11. describeRule returns undefined for an unknown rule', () => {
  const store = createBusStore()
  expect(store.describeRule('default', 'ghost')).toBeUndefined()
})

it('12. enableRule / disableRule toggle the state', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  store.disableRule('default', 'my-rule')
  expect(store.describeRule('default', 'my-rule').state).toBe('DISABLED')
  store.enableRule('default', 'my-rule')
  expect(store.describeRule('default', 'my-rule').state).toBe('ENABLED')
})

it('13. deleteRule removes the rule', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  store.deleteRule('default', 'my-rule')
  expect(store.describeRule('default', 'my-rule')).toBeUndefined()
  expect(store.listRules('default')).toHaveLength(0)
})

it('14. listRules filters by name prefix', () => {
  const store = createBusStore()
  store.putRule('default', 'orders-created', {
    eventPattern: { source: ['x'] },
  })
  store.putRule('default', 'orders-shipped', {
    eventPattern: { source: ['x'] },
  })
  store.putRule('default', 'users-created', { eventPattern: { source: ['x'] } })
  expect(
    store
      .listRules('default', 'orders-')
      .map((r) => r.name)
      .sort(),
  ).toEqual(['orders-created', 'orders-shipped'])
  expect(store.listRules('default')).toHaveLength(3)
})

it('15. putRule auto-ensures the named bus', () => {
  const store = createBusStore()
  store.putRule('orders', 'r1', { eventPattern: { source: ['x'] } })
  expect(store.getBus('orders')).toBeDefined()
  expect(store.describeRule('orders', 'r1')).toBeDefined()
})

it('16. a rule on a named bus is isolated from the default bus', () => {
  const store = createBusStore()
  store.putRule('orders', 'r1', { eventPattern: { source: ['x'] } })
  expect(store.listRules('default')).toHaveLength(0)
  expect(store.listRules('orders')).toHaveLength(1)
  expect(store.describeRule('default', 'r1')).toBeUndefined()
})

// ===========================================================================
// Targets
// ===========================================================================

it('17. putTargets normalises and stores raw target config', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  store.putTargets('default', 'my-rule', [
    {
      Id: 't1',
      Arn: 'arn:aws:lambda:us-east-1:000000000000:function:handler',
      Input: '{"hello":"world"}',
      RoleArn: 'arn:aws:iam::000000000000:role/r',
    },
  ])
  const targets = store.listTargetsByRule('default', 'my-rule')
  expect(targets).toHaveLength(1)
  expect(targets[0]).toMatchObject({
    id: 't1',
    arn: 'arn:aws:lambda:us-east-1:000000000000:function:handler',
    input: '{"hello":"world"}',
    inputPath: null,
    inputTransformer: null,
    roleArn: 'arn:aws:iam::000000000000:role/r',
    kind: 'unsupported',
    resolved: null,
  })
})

it('18. putTargets carries InputPath and InputTransformer', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  const inputTransformer = {
    InputPathsMap: { id: '$.detail.id' },
    InputTemplate: '{"id":<id>}',
  }
  store.putTargets('default', 'my-rule', [
    {
      Id: 't2',
      Arn: 'arn:aws:sqs:us-east-1:000000000000:q',
      InputPath: '$.detail',
      InputTransformer: inputTransformer,
    },
  ])
  const [target] = store.listTargetsByRule('default', 'my-rule')
  expect(target.inputPath).toBe('$.detail')
  expect(target.inputTransformer).toEqual(inputTransformer)
  expect(target.input).toBeNull()
})

it('19. putTargets with the same Id overwrites in place', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  store.putTargets('default', 'my-rule', [
    { Id: 't1', Arn: 'arn:aws:sqs:us-east-1:000000000000:q1' },
  ])
  store.putTargets('default', 'my-rule', [
    { Id: 't1', Arn: 'arn:aws:sqs:us-east-1:000000000000:q2' },
  ])
  const targets = store.listTargetsByRule('default', 'my-rule')
  expect(targets).toHaveLength(1)
  expect(targets[0].arn).toBe('arn:aws:sqs:us-east-1:000000000000:q2')
})

it('20. removeTargets removes by Id', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  store.putTargets('default', 'my-rule', [
    { Id: 't1', Arn: 'arn:aws:sqs:us-east-1:000000000000:q1' },
    { Id: 't2', Arn: 'arn:aws:sqs:us-east-1:000000000000:q2' },
  ])
  store.removeTargets('default', 'my-rule', ['t1'])
  const targets = store.listTargetsByRule('default', 'my-rule')
  expect(targets.map((t) => t.id)).toEqual(['t2'])
})

it('21. listTargetsByRule is empty for a rule with no targets', () => {
  const store = createBusStore()
  store.putRule('default', 'my-rule', { eventPattern: { source: ['x'] } })
  expect(store.listTargetsByRule('default', 'my-rule')).toEqual([])
})

it('22. targets on a named bus are isolated from the default bus', () => {
  const store = createBusStore()
  store.putRule('default', 'r1', { eventPattern: { source: ['x'] } })
  store.putRule('orders', 'r1', { eventPattern: { source: ['x'] } })
  store.putTargets('orders', 'r1', [
    { Id: 't1', Arn: 'arn:aws:sqs:us-east-1:000000000000:q' },
  ])
  expect(store.listTargetsByRule('orders', 'r1')).toHaveLength(1)
  expect(store.listTargetsByRule('default', 'r1')).toHaveLength(0)
})
