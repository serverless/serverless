import { jest } from '@jest/globals'
import { createBusStore } from '../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/eventbridge/bus-store.js'
import {
  createRegistry,
  registerEventResource,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'
import { wireEventBridge } from '../../../../../../../../lib/plugins/aws/offline/lib/event-sources/eb-wiring.js'

const ACCOUNT = '000000000000'
const REGION = 'us-east-1'

/**
 * Build a stub logger that silently discards every message.
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
 * Build a minimal `serverless` stand-in carrying just the function map the
 * wiring reads.
 */
function makeServerless(functions = {}) {
  return { service: { functions } }
}

function busArn(name) {
  return `arn:aws:events:${REGION}:${ACCOUNT}:event-bus/${name}`
}

function ruleArn(name) {
  return `arn:aws:events:${REGION}:${ACCOUNT}:rule/${name}`
}

// ---------------------------------------------------------------------------
// events: - eventBridge (pattern)
// ---------------------------------------------------------------------------

it('wires a bus, rule, and lambda target from an events: - eventBridge pattern', () => {
  const store = createBusStore()
  const registry = createRegistry()
  const serverless = makeServerless({
    onOrder: {
      events: [{ eventBridge: { pattern: { source: ['shop.orders'] } } }],
    },
  })

  const result = wireEventBridge({
    serverless,
    registry,
    store,
    logger: makeLogger(),
  })

  // The default bus already exists; the rule is created on it.
  const rules = store.listRules('default')
  expect(rules).toHaveLength(1)
  expect(rules[0].eventPattern).toEqual({ source: ['shop.orders'] })

  const targets = store.listTargetsByRule('default', rules[0].name)
  expect(targets).toHaveLength(1)
  expect(targets[0].kind).toBe('lambda')
  expect(targets[0].resolved).toEqual({ functionKey: 'onOrder' })

  expect(result.ruleCount).toBeGreaterThanOrEqual(1)
  expect(result.targetCount).toBeGreaterThanOrEqual(1)
})

it('wires onto a named eventBus rather than the default bus', () => {
  const store = createBusStore()
  const registry = createRegistry()
  const serverless = makeServerless({
    onOrder: {
      events: [
        {
          eventBridge: {
            eventBus: 'custom-bus',
            pattern: { source: ['shop.orders'] },
          },
        },
      ],
    },
  })

  wireEventBridge({ serverless, registry, store, logger: makeLogger() })

  expect(store.getBus('custom-bus')).toBeDefined()
  const rules = store.listRules('custom-bus')
  expect(rules).toHaveLength(1)
  expect(store.listRules('default')).toHaveLength(0)
})

it('normalises input/inputPath/inputTransformer onto the target', () => {
  const store = createBusStore()
  const registry = createRegistry()
  const serverless = makeServerless({
    onOrder: {
      events: [
        {
          eventBridge: {
            pattern: { source: ['shop.orders'] },
            input: { fixed: true },
          },
        },
      ],
    },
    onShip: {
      events: [
        {
          eventBridge: {
            pattern: { source: ['shop.ship'] },
            inputTransformer: {
              inputPathsMap: { id: '$.detail.id' },
              inputTemplate: '{"shipped": <id>}',
            },
          },
        },
      ],
    },
  })

  wireEventBridge({ serverless, registry, store, logger: makeLogger() })

  const orderRule = store
    .listRules('default')
    .find((r) => JSON.stringify(r.eventPattern).includes('shop.orders'))
  const orderTarget = store.listTargetsByRule('default', orderRule.name)[0]
  // The object Input is stored as a JSON string the deliverer can parse.
  expect(orderTarget.input).toBe(JSON.stringify({ fixed: true }))

  const shipRule = store
    .listRules('default')
    .find((r) => JSON.stringify(r.eventPattern).includes('shop.ship'))
  const shipTarget = store.listTargetsByRule('default', shipRule.name)[0]
  // The camelCase transformer is converted to the AWS PascalCase shape.
  expect(shipTarget.inputTransformer).toEqual({
    InputPathsMap: { id: '$.detail.id' },
    InputTemplate: '{"shipped": <id>}',
  })
})

it('skips a schedule-only events: - eventBridge entry', () => {
  const store = createBusStore()
  const registry = createRegistry()
  const serverless = makeServerless({
    cron: {
      events: [{ eventBridge: { schedule: 'rate(1 minute)' } }],
    },
  })

  const result = wireEventBridge({
    serverless,
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.listRules('default')).toHaveLength(0)
  expect(result.ruleCount).toBe(0)
  expect(result.targetCount).toBe(0)
})

// ---------------------------------------------------------------------------
// Registry bus / rule records
// ---------------------------------------------------------------------------

it('ensures a bus and a rule declared as registry resources', () => {
  const store = createBusStore()
  const registry = createRegistry()
  registerEventResource(registry, {
    logicalId: 'CustomBus',
    name: 'custom-bus',
    arn: busArn('custom-bus'),
    kind: 'bus',
    properties: { Name: 'custom-bus' },
  })
  registerEventResource(registry, {
    logicalId: 'OrdersRule',
    name: 'orders-rule',
    arn: ruleArn('orders-rule'),
    kind: 'rule',
    properties: {
      Name: 'orders-rule',
      EventBusName: 'custom-bus',
      EventPattern: { source: ['shop.orders'] },
      State: 'ENABLED',
    },
  })

  const result = wireEventBridge({
    serverless: makeServerless(),
    registry,
    store,
    logger: makeLogger(),
  })

  expect(store.getBus('custom-bus')).toBeDefined()
  const rule = store.describeRule('custom-bus', 'orders-rule')
  expect(rule).toBeDefined()
  expect(rule.eventPattern).toEqual({ source: ['shop.orders'] })
  expect(rule.state).toBe('ENABLED')
  expect(result.busCount).toBeGreaterThanOrEqual(1)
  expect(result.ruleCount).toBeGreaterThanOrEqual(1)
})

it('parses a registry rule whose EventPattern is a JSON string', () => {
  const store = createBusStore()
  const registry = createRegistry()
  registerEventResource(registry, {
    logicalId: 'OrdersRule',
    name: 'orders-rule',
    arn: ruleArn('orders-rule'),
    kind: 'rule',
    properties: {
      Name: 'orders-rule',
      EventPattern: JSON.stringify({ source: ['shop.orders'] }),
    },
  })

  wireEventBridge({
    serverless: makeServerless(),
    registry,
    store,
    logger: makeLogger(),
  })

  const rule = store.describeRule('default', 'orders-rule')
  expect(rule.eventPattern).toEqual({ source: ['shop.orders'] })
})

it('returns the bus/rule/target counts', () => {
  const store = createBusStore()
  const registry = createRegistry()
  const serverless = makeServerless({
    onOrder: {
      events: [{ eventBridge: { pattern: { source: ['shop.orders'] } } }],
    },
  })

  const result = wireEventBridge({
    serverless,
    registry,
    store,
    logger: makeLogger(),
  })

  expect(result).toEqual({
    busCount: expect.any(Number),
    ruleCount: expect.any(Number),
    targetCount: expect.any(Number),
  })
  expect(result.ruleCount).toBe(1)
  expect(result.targetCount).toBe(1)
})
