import {
  jest,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it,
  expect,
} from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

// Mock custom resources
jest.unstable_mockModule(
  '../../../../../../../../lib/plugins/aws/custom-resources/index.js',
  () => ({
    addCustomResourceToService: jest.fn(),
  }),
)

// Import after mocking
const { default: AwsCompileEventBridgeEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/index.js')
const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

const { classifyEventBus, parseEventBusArn } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/bus-type.js')

const { compileFilterPattern } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/subscriber-pattern.js')

const NEW_BUS_ARN =
  'arn:aws:events:us-east-1:111122223333:event-busv2/orders/abcdefghijklmnopqrstuvwxy'
const CLASSIC_BUS_ARN = 'arn:aws:events:us-east-1:111122223333:event-bus/orders'

describe('classifyEventBus', () => {
  it('classifies a new-bus ARN as subscriber', () => {
    expect(classifyEventBus(NEW_BUS_ARN, undefined)).toBe('subscriber')
  })

  it('classifies a Ref to an AWS::EventsV2::EventBus resource as subscriber', () => {
    const resources = { OrdersBus: { Type: 'AWS::EventsV2::EventBus' } }
    expect(classifyEventBus({ Ref: 'OrdersBus' }, resources)).toBe('subscriber')
  })

  it('classifies a Ref to an AWS::Events::EventBus resource as rule', () => {
    const resources = { OrdersBus: { Type: 'AWS::Events::EventBus' } }
    expect(classifyEventBus({ Ref: 'OrdersBus' }, resources)).toBe('rule')
  })

  it('classifies a Ref to a resource missing from resources as rule', () => {
    expect(classifyEventBus({ Ref: 'OrdersBus' }, {})).toBe('rule')
    expect(classifyEventBus({ Ref: 'OrdersBus' }, undefined)).toBe('rule')
  })

  it('classifies a GetAtt of EventBusArn as subscriber when the resource is absent', () => {
    expect(
      classifyEventBus({ 'Fn::GetAtt': ['OrdersBus', 'EventBusArn'] }, {}),
    ).toBe('subscriber')
  })

  it('classifies a GetAtt of Name as rule', () => {
    const resources = { OrdersBus: { Type: 'AWS::EventsV2::EventBus' } }
    expect(
      classifyEventBus({ 'Fn::GetAtt': ['OrdersBus', 'Name'] }, resources),
    ).toBe('rule')
  })

  it('classifies a bus name as rule', () => {
    expect(classifyEventBus('orders', {})).toBe('rule')
  })

  it('classifies the default bus as rule', () => {
    expect(classifyEventBus('default', {})).toBe('rule')
  })

  it('classifies an absent eventBus as rule', () => {
    expect(classifyEventBus(undefined, {})).toBe('rule')
  })

  it('classifies Fn::ImportValue as rule', () => {
    expect(classifyEventBus({ 'Fn::ImportValue': 'x' }, {})).toBe('rule')
  })

  it('classifies Fn::Sub as rule', () => {
    expect(
      classifyEventBus(
        {
          'Fn::Sub':
            'arn:aws:events:${AWS::Region}:${AWS::AccountId}:event-bus/orders',
        },
        {},
      ),
    ).toBe('rule')
  })

  it('classifies a Classic bus ARN as rule', () => {
    expect(classifyEventBus(CLASSIC_BUS_ARN, {})).toBe('rule')
  })
})

describe('parseEventBusArn', () => {
  it('parses a new-bus ARN into region, account id and name', () => {
    expect(parseEventBusArn(NEW_BUS_ARN)).toEqual({
      region: 'us-east-1',
      accountId: '111122223333',
      name: 'orders',
    })
  })

  it('returns null for a Classic bus ARN', () => {
    expect(parseEventBusArn(CLASSIC_BUS_ARN)).toBeNull()
  })

  it('returns null for a value that is not a string', () => {
    expect(parseEventBusArn({ Ref: 'OrdersBus' })).toBeNull()
    expect(parseEventBusArn(undefined)).toBeNull()
  })
})

describe('compileFilterPattern', () => {
  it('returns a plain JSON string for a pattern without intrinsics', () => {
    expect(compileFilterPattern({ source: ['orders'] })).toBe(
      '{"source":["orders"]}',
    )
  })

  it('joins a Ref into the pattern string inside JSON quotes', () => {
    expect(
      compileFilterPattern({ account: [{ Ref: 'AWS::AccountId' }] }),
    ).toEqual({
      'Fn::Join': ['', ['{"account":["', { Ref: 'AWS::AccountId' }, '"]}']],
    })
  })

  it('escapes backslashes and quotes inside an Fn::Sub template', () => {
    const result = compileFilterPattern({
      detail: { id: [{ 'Fn::Sub': 'a"b-${AWS::Region}' }] },
    })
    expect(result['Fn::Join'][1]).toContainEqual({
      'Fn::Sub': 'a\\"b-${AWS::Region}',
    })
  })

  it('escapes the template of an Fn::Sub with a variable map and leaves the map alone', () => {
    const result = compileFilterPattern({
      detail: { id: [{ 'Fn::Sub': ['a\\b-${X}', { X: 'q"r' }] }] },
    })
    expect(result['Fn::Join'][1]).toContainEqual({
      'Fn::Sub': ['a\\\\b-${X}', { X: 'q"r' }],
    })
  })

  it('escapes newlines and tabs inside an Fn::Sub template', () => {
    const result = compileFilterPattern({
      detail: { id: [{ 'Fn::Sub': 'a\nb\tc-${AWS::Region}\n' }] },
    })
    expect(result['Fn::Join'][1]).toContainEqual({
      'Fn::Sub': 'a\\nb\\tc-${AWS::Region}\\n',
    })
  })

  it('escapes newlines inside the template of an Fn::Sub with a variable map', () => {
    const result = compileFilterPattern({
      detail: { id: [{ 'Fn::Sub': ['a\n${X}', { X: 'q\nr' }] }] },
    })
    expect(result['Fn::Join'][1]).toContainEqual({
      'Fn::Sub': ['a\\n${X}', { X: 'q\nr' }],
    })
  })

  it('leaves non-intrinsic objects in the pattern untouched', () => {
    expect(
      compileFilterPattern({ detail: { total: [{ numeric: ['>', 500] }] } }),
    ).toBe('{"detail":{"total":[{"numeric":[">",500]}]}}')
  })

  it('joins several intrinsics in order', () => {
    expect(
      compileFilterPattern({
        account: [{ Ref: 'AWS::AccountId' }],
        region: [{ 'Fn::GetAtt': ['Bus', 'Region'] }],
      }),
    ).toEqual({
      'Fn::Join': [
        '',
        [
          '{"account":["',
          { Ref: 'AWS::AccountId' },
          '"],"region":["',
          { 'Fn::GetAtt': ['Bus', 'Region'] },
          '"]}',
        ],
      ],
    })
  })

  it('does not mistake user content resembling a placeholder for an intrinsic', () => {
    const result = compileFilterPattern({
      source: ['__sls_intrinsic_0__'],
      account: [{ Ref: 'AWS::AccountId' }],
    })
    expect(result).toEqual({
      'Fn::Join': [
        '',
        [
          '{"source":["__sls_intrinsic_0__"],"account":["',
          { Ref: 'AWS::AccountId' },
          '"]}',
        ],
      ],
    })
  })
})

const { buildSubscriber, computeSubscriberHash } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/compile-subscriber.js')

describe('buildSubscriber', () => {
  let naming

  beforeEach(() => {
    const options = { stage: 'dev', region: 'us-east-1' }
    const serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
    serverless.service.service = 'orders'
    serverless.service.provider.stage = 'dev'
    naming = new AwsProvider(serverless, options).naming
  })

  const makeFunctionObj = (overrides = {}) => ({
    name: 'orders-dev-fulfil',
    timeout: 20,
    ...overrides,
  })

  const build = ({ event = {}, functionObj, index = 1 } = {}) =>
    buildSubscriber({
      naming,
      functionName: 'fulfil',
      functionObj: functionObj || makeFunctionObj(),
      event: {
        eventBus: NEW_BUS_ARN,
        pattern: { source: ['orders'] },
        ...event,
      },
      index,
      deliveryRoleLogicalId: 'IamRoleEventBridgeDelivery',
    })

  it('builds the full resource for a minimal event', () => {
    const { logicalId, resource, usesGeneratedRole } = build()
    expect(logicalId).toMatch(/^FulfilEventBridgeSubscriber1[0-9a-f]{8}$/)
    const hash = logicalId.slice(-8)
    expect(usesGeneratedRole).toBe(true)
    expect(resource).toEqual({
      Type: 'AWS::EventsV2::Subscriber',
      Properties: {
        EventBusArn: NEW_BUS_ARN,
        Name: `orders-dev-fulfil-1-${hash}`,
        Type: 'UNORDERED',
        FilterConfiguration: {
          Filters: [{ Scope: 'DATA', Pattern: '{"source":["orders"]}' }],
        },
        State: 'RUNNING',
        InvokeConfiguration: {
          TargetArn: { 'Fn::GetAtt': ['FulfilLambdaFunction', 'Arn'] },
          RoleArn: { 'Fn::GetAtt': ['IamRoleEventBridgeDelivery', 'Arn'] },
          LambdaParameters: {
            InvocationType: 'REQUEST_RESPONSE',
            InvocationTimeoutSeconds: '20',
          },
        },
      },
    })
  })

  it('omits FilterConfiguration without a pattern', () => {
    const { resource } = build({ event: { pattern: undefined } })
    expect(resource.Properties).not.toHaveProperty('FilterConfiguration')
  })

  it('caps the invocation timeout at 30 seconds', () => {
    const { resource } = build({
      functionObj: makeFunctionObj({ timeout: 120 }),
    })
    expect(resource.Properties.InvokeConfiguration.LambdaParameters).toEqual({
      InvocationType: 'REQUEST_RESPONSE',
      InvocationTimeoutSeconds: '30',
    })
  })

  it('invokes asynchronously with async: true', () => {
    const { resource } = build({ event: { async: true } })
    expect(resource.Properties.InvokeConfiguration.LambdaParameters).toEqual({
      InvocationType: 'EVENT',
    })
  })

  it.each(['FIFO', 'fifo'])(
    'maps every configured key (ordering %s)',
    (ordering) => {
      const functionObj = makeFunctionObj({
        targetAlias: {
          name: 'provisioned',
          logicalId: 'FulfilProvConcLambdaAlias',
        },
      })
      const { resource } = build({
        functionObj,
        event: {
          description: 'Fulfil orders',
          pattern: { account: [{ Ref: 'AWS::AccountId' }] },
          ordering,
          batchSize: 10,
          maximumBatchingWindow: 5,
          retryPolicy: { maximumRetryAttempts: 3, maximumEventAge: 3600 },
          deadLetterQueueArn: 'arn:aws:sqs:us-east-1:111122223333:dlq',
          enabled: false,
          resumePosition: 'latest',
        },
      })
      expect(resource.DependsOn).toBe('FulfilProvConcLambdaAlias')
      expect(resource.Properties).toMatchObject({
        EventBusArn: NEW_BUS_ARN,
        Description: 'Fulfil orders',
        Type: 'FIFO',
        FilterConfiguration: {
          Filters: [
            {
              Scope: 'DATA',
              Pattern: {
                'Fn::Join': [
                  '',
                  ['{"account":["', { Ref: 'AWS::AccountId' }, '"]}'],
                ],
              },
            },
          ],
        },
        BatchConfiguration: { MaxBatchSize: 10, MaxBatchWindowInSeconds: 5 },
        RetryPolicy: { MaxRetryAttempts: 3, MaxEventAgeInSeconds: 3600 },
        OnFailureConfiguration: {
          Arn: 'arn:aws:sqs:us-east-1:111122223333:dlq',
        },
        State: 'STOPPED',
        ResumePosition: 'LATEST',
        InvokeConfiguration: {
          TargetArn: {
            'Fn::Join': [
              ':',
              [
                { 'Fn::GetAtt': ['FulfilLambdaFunction', 'Arn'] },
                'provisioned',
              ],
            ],
          },
        },
      })
    },
  )

  it('omits RetryPolicy when retryPolicy sets no key', () => {
    const { resource } = build({ event: { retryPolicy: {} } })
    expect(resource.Properties).not.toHaveProperty('RetryPolicy')
  })

  it('emits only the retry key that is set', () => {
    const { resource } = build({
      event: { retryPolicy: { maximumEventAge: 600 } },
    })
    expect(resource.Properties.RetryPolicy).toEqual({
      MaxEventAgeInSeconds: 600,
    })
  })

  it('sets State RUNNING when enabled or unset, so a re-enable resumes a stopped subscriber', () => {
    expect(build({ event: { enabled: true } }).resource.Properties.State).toBe(
      'RUNNING',
    )
    expect(build().resource.Properties.State).toBe('RUNNING')
    expect(build({ event: { enabled: false } }).resource.Properties.State).toBe(
      'STOPPED',
    )
  })

  it('omits DependsOn without an alias', () => {
    const { resource } = build({ event: { enabled: true } })
    expect(resource).not.toHaveProperty('DependsOn')
  })

  it.each([
    ['pattern', { pattern: { source: ['other'] } }],
    ['batchSize', { batchSize: 50 }],
    ['retryPolicy', { retryPolicy: { maximumRetryAttempts: 1 } }],
    [
      'deadLetterQueueArn',
      { deadLetterQueueArn: 'arn:aws:sqs:us-east-1:111122223333:x' },
    ],
    ['enabled', { enabled: false }],
  ])('keeps the logical ID and Name when %s changes', (_key, event) => {
    const base = build()
    const changed = build({ event })
    expect(changed.logicalId).toBe(base.logicalId)
    expect(changed.resource.Properties.Name).toBe(base.resource.Properties.Name)
  })

  it.each([
    ['ordering', { event: { ordering: 'FIFO' } }],
    [
      'eventBus',
      {
        event: {
          eventBus:
            'arn:aws:events:us-east-1:111122223333:event-busv2/other/abcdefghijklmnopqrstuvwxy',
        },
      },
    ],
    [
      'targetAlias',
      {
        functionObj: makeFunctionObj({
          targetAlias: { name: 'live', logicalId: 'FulfilAliasLive' },
        }),
      },
    ],
  ])('changes the logical ID and Name when %s changes', (_key, input) => {
    const base = build()
    const changed = build(input)
    expect(changed.logicalId).not.toBe(base.logicalId)
    expect(changed.resource.Properties.Name).not.toBe(
      base.resource.Properties.Name,
    )
  })

  it('uses a custom name for Name and the logical ID', () => {
    const { logicalId, resource } = build({ event: { name: 'orders-v2' } })
    expect(resource.Properties.Name).toBe('orders-v2')
    expect(logicalId).toBe('Ordersv2EventBridgeSubscriber')
  })

  it('uses a provided role and reports that the generated role is unused', () => {
    const role = 'arn:aws:iam::111122223333:role/pre'
    const { resource, usesGeneratedRole } = build({ event: { role } })
    expect(resource.Properties.InvokeConfiguration.RoleArn).toBe(role)
    expect(usesGeneratedRole).toBe(false)
  })
})

describe('computeSubscriberHash', () => {
  const target = { 'Fn::GetAtt': ['FulfilLambdaFunction', 'Arn'] }

  it('returns 8 hex characters', () => {
    expect(
      computeSubscriberHash({
        eventBus: NEW_BUS_ARN,
        target,
        type: 'UNORDERED',
      }),
    ).toMatch(/^[0-9a-f]{8}$/)
  })

  it('ignores key order at every depth', () => {
    const a = computeSubscriberHash({
      eventBus: { 'Fn::GetAtt': ['Bus', 'EventBusArn'] },
      target: { 'Fn::Join': [':', [target, 'live']] },
      type: 'FIFO',
    })
    const b = computeSubscriberHash({
      type: 'FIFO',
      target: { 'Fn::Join': [':', [target, 'live']] },
      eventBus: { 'Fn::GetAtt': ['Bus', 'EventBusArn'] },
    })
    expect(a).toBe(b)
  })
})

const { validateSubscriberEvent, validateRuleEvent } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/compile-subscriber.js')
const { log } = await import('@serverless/util')
const { addCustomResourceToService } =
  await import('../../../../../../../../lib/plugins/aws/custom-resources/index.js')
const { default: Ajv } = await import('ajv')
const { default: regexpKeyword } =
  await import('../../../../../../../../lib/classes/config-schema-handler/regexp-keyword.js')

const createPlugin = () => {
  const options = { stage: 'dev', region: 'us-east-1' }
  const serverless = new Serverless({ commands: [], options: {} })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless._logDeprecation = jest.fn()
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
  }
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  const plugin = new AwsCompileEventBridgeEvents(serverless, options)
  return { serverless, plugin }
}

describe('eventBridge validation per bus type', () => {
  let serverless
  let plugin

  beforeEach(() => {
    log.warning.mockClear()
    ;({ serverless, plugin } = createPlugin())
  })

  const compile = (
    eventBridge,
    { timeout = 6, useCloudFormation, resources } = {},
  ) => {
    serverless.service.functions = {
      fulfil: { name: 'orders-dev-fulfil', timeout, events: [{ eventBridge }] },
    }
    if (useCloudFormation !== undefined) {
      serverless.service.provider.eventBridge = { useCloudFormation }
    }
    if (resources) serverless.service.resources = { Resources: resources }
    return plugin.compileEventBridgeEvents()
  }

  const expectError = (fn, code, message) => {
    let error
    try {
      fn()
    } catch (caught) {
      error = caught
    }
    expect(error).toBeDefined()
    expect(error.code).toBe(code)
    expect(error.message).toBe(message)
  }

  describe('Custom Event Bus', () => {
    it.each(['schedule', 'input', 'inputPath', 'inputTransformer'])(
      'rejects "%s"',
      (key) => {
        const values = {
          schedule: 'rate(1 hour)',
          input: { a: 1 },
          inputPath: '$.detail',
          inputTransformer: { inputTemplate: '{}' },
        }
        expectError(
          () => compile({ eventBus: NEW_BUS_ARN, [key]: values[key] }),
          'EVENTBRIDGE_SUBSCRIBER_UNSUPPORTED_PROPERTY',
          `Function "fulfil": "${key}" applies to Classic rules only and has no equivalent on a Custom Event Bus. ${
            key === 'schedule'
              ? 'Use a "schedule" event for a scheduled invocation.'
              : 'Reshape the event in your handler.'
          }`,
        )
      },
    )

    it('reports the first unsupported property in the listed order', () => {
      expectError(
        () =>
          compile({
            eventBus: NEW_BUS_ARN,
            inputTransformer: { inputTemplate: '{}' },
            inputPath: '$.detail',
          }),
        'EVENTBRIDGE_SUBSCRIBER_UNSUPPORTED_PROPERTY',
        'Function "fulfil": "inputPath" applies to Classic rules only and has no equivalent on a Custom Event Bus. Reshape the event in your handler.',
      )
    })

    it.each(['fifo', 'FIFO'])(
      'rejects ordering %s with async: true',
      (ordering) => {
        expectError(
          () => compile({ eventBus: NEW_BUS_ARN, ordering, async: true }),
          'EVENTBRIDGE_SUBSCRIBER_FIFO_ASYNC',
          'Function "fulfil": a FIFO subscriber delivers in order only when it waits for the function. Remove "async: true" or set "ordering: unordered".',
        )
      },
    )

    it('rejects ordering fifo with a timeout above 30 seconds', () => {
      expectError(
        () =>
          compile({ eventBus: NEW_BUS_ARN, ordering: 'fifo' }, { timeout: 31 }),
        'EVENTBRIDGE_SUBSCRIBER_FIFO_TIMEOUT',
        'Function "fulfil" has a 31s timeout, but EventBridge waits at most 30s for an ordered subscriber and then retries while the first invocation is still running, which breaks the order. Set the function timeout to 30s or less.',
      )
    })

    it('accepts ordering fifo with a 30 second timeout', () => {
      expect(() =>
        compile({ eventBus: NEW_BUS_ARN, ordering: 'fifo' }, { timeout: 30 }),
      ).not.toThrow()
      expect(log.warning).not.toHaveBeenCalled()
    })

    it('rejects a bus ARN in another Region', () => {
      expectError(
        () =>
          compile({
            eventBus:
              'arn:aws:events:eu-west-1:111122223333:event-busv2/orders/abcdefghijklmnopqrstuvwxy',
          }),
        'EVENTBRIDGE_SUBSCRIBER_REGION_MISMATCH',
        'Function "fulfil": the event bus is in eu-west-1, but this service deploys to us-east-1. A subscriber must be in its bus\'s Region.',
      )
    })

    it('skips the Region check for a bus ARN that does not parse', () => {
      expect(() =>
        compile({
          eventBus: 'arn:aws:events:eu-west-1:1:event-busv2/orders',
        }),
      ).not.toThrow()
    })

    it('rejects provider.eventBridge.useCloudFormation: false', () => {
      expectError(
        () => compile({ eventBus: NEW_BUS_ARN }, { useCloudFormation: false }),
        'EVENTBRIDGE_SUBSCRIBER_REQUIRES_CLOUDFORMATION',
        'Function "fulfil": a Custom Event Bus subscriber is deployed only with native CloudFormation. Remove "provider.eventBridge.useCloudFormation: false".',
      )
    })

    it('classifies a Ref to an AWS::EventsV2::EventBus from service resources', () => {
      expectError(
        () =>
          compile(
            { eventBus: { Ref: 'OrdersBus' }, schedule: 'rate(1 hour)' },
            { resources: { OrdersBus: { Type: 'AWS::EventsV2::EventBus' } } },
          ),
        'EVENTBRIDGE_SUBSCRIBER_UNSUPPORTED_PROPERTY',
        'Function "fulfil": "schedule" applies to Classic rules only and has no equivalent on a Custom Event Bus. Use a "schedule" event for a scheduled invocation.',
      )
    })

    it.each([undefined, 'unordered', 'UNORDERED'])(
      'warns for a synchronous subscriber (ordering %s) with a timeout above 30 seconds',
      (ordering) => {
        compile({ eventBus: NEW_BUS_ARN, ordering }, { timeout: 60 })
        expect(log.warning).toHaveBeenCalledTimes(1)
        expect(log.warning).toHaveBeenCalledWith(
          'Function "fulfil" has a 60s timeout, but EventBridge waits at most 30s for a synchronous subscriber and retries after that, so one event can run concurrently more than once. Set the function timeout to 30s or less, or set "async: true".',
        )
      },
    )

    it('does not warn for an asynchronous subscriber with a long timeout', () => {
      compile({ eventBus: NEW_BUS_ARN, async: true }, { timeout: 60 })
      expect(log.warning).not.toHaveBeenCalled()
    })

    it('accepts a subscriber without a pattern', () => {
      expect(() => compile({ eventBus: NEW_BUS_ARN })).not.toThrow()
    })

    it('runs the guards in order, first failure wins', () => {
      const event = {
        eventBus:
          'arn:aws:events:eu-west-1:111122223333:event-busv2/orders/abcdefghijklmnopqrstuvwxy',
        schedule: 'rate(1 hour)',
        ordering: 'fifo',
        async: true,
      }
      const validate =
        (overrides, timeout = 60) =>
        () =>
          validateSubscriberEvent({
            functionKey: 'fulfil',
            functionObj: { timeout },
            event: { ...event, ...overrides },
            providerRegion: 'us-east-1',
            useCloudFormation: false,
          })
      expect(validate({})).toThrow(
        expect.objectContaining({
          code: 'EVENTBRIDGE_SUBSCRIBER_REQUIRES_CLOUDFORMATION',
        }),
      )
      const withCloudFormation =
        (overrides, timeout = 60) =>
        () =>
          validateSubscriberEvent({
            functionKey: 'fulfil',
            functionObj: { timeout },
            event: { ...event, ...overrides },
            providerRegion: 'us-east-1',
            useCloudFormation: undefined,
          })
      expect(withCloudFormation({})).toThrow(
        expect.objectContaining({
          code: 'EVENTBRIDGE_SUBSCRIBER_UNSUPPORTED_PROPERTY',
        }),
      )
      expect(withCloudFormation({ schedule: undefined })).toThrow(
        expect.objectContaining({ code: 'EVENTBRIDGE_SUBSCRIBER_FIFO_ASYNC' }),
      )
      expect(withCloudFormation({ schedule: undefined, async: false })).toThrow(
        expect.objectContaining({
          code: 'EVENTBRIDGE_SUBSCRIBER_FIFO_TIMEOUT',
        }),
      )
      expect(
        withCloudFormation({ schedule: undefined, async: false }, 30),
      ).toThrow(
        expect.objectContaining({
          code: 'EVENTBRIDGE_SUBSCRIBER_REGION_MISMATCH',
        }),
      )
      expect(log.warning).not.toHaveBeenCalled()
    })
  })

  describe('Custom Event Bus - Classic', () => {
    it.each([
      ['ordering', 'fifo'],
      ['batchSize', 10],
      ['maximumBatchingWindow', 5],
      ['async', true],
      ['resumePosition', 'latest'],
      ['role', 'arn:aws:iam::111122223333:role/delivery'],
    ])('rejects "%s"', (key, value) => {
      expectError(
        () => compile({ eventBus: 'orders', pattern: {}, [key]: value }),
        'EVENTBRIDGE_RULE_UNSUPPORTED_PROPERTY',
        `Function "fulfil": "${key}" applies to Custom Event Bus subscribers only, and the Framework treats "orders" as a Classic event bus.`,
      )
    })

    it('rejects a rule name over 64 characters on a Classic Ref bus', () => {
      expectError(
        () =>
          compile({
            eventBus: { Ref: 'ClassicBus' },
            pattern: { source: ['orders'] },
            name: 'a'.repeat(65),
          }),
        'EVENTBRIDGE_RULE_NAME_TOO_LONG',
        'Function "fulfil": the eventBridge rule name "' +
          'a'.repeat(65) +
          '" is 65 characters long; a Classic rule name takes up to 64.',
      )
    })

    it('warns about an unknown pattern key on a Classic Ref bus', () => {
      compile({
        eventBus: { Ref: 'ClassicBus' },
        pattern: { detailType: ['OrderPlaced'] },
      })
      expect(log.warning).toHaveBeenCalledWith(
        'Function "fulfil": the eventBridge pattern key "detailType" is not a field of a Classic event, so the rule matches no events. Check its spelling.',
      )
    })

    it('accepts the Classic envelope keys on a Classic Ref bus', () => {
      compile({
        eventBus: { Ref: 'ClassicBus' },
        pattern: { 'detail-type': ['OrderPlaced'], detail: { id: [1] } },
      })
      expect(log.warning).not.toHaveBeenCalled()
    })

    it('names the default bus when eventBus is omitted', () => {
      expectError(
        () => compile({ schedule: 'rate(1 hour)', batchSize: 10 }),
        'EVENTBRIDGE_RULE_UNSUPPORTED_PROPERTY',
        'Function "fulfil": "batchSize" applies to Custom Event Bus subscribers only, and the Framework treats "default" as a Classic event bus.',
      )
    })

    it('names an intrinsic bus by its JSON', () => {
      expectError(
        () =>
          compile({
            eventBus: { 'Fn::ImportValue': 'bus' },
            schedule: 'rate(1 hour)',
            async: false,
          }),
        'EVENTBRIDGE_RULE_UNSUPPORTED_PROPERTY',
        'Function "fulfil": "async" applies to Custom Event Bus subscribers only, and the Framework treats "{"Fn::ImportValue":"bus"}" as a Classic event bus.',
      )
    })

    it('reports the first new key in the listed order', () => {
      expectError(
        () =>
          validateRuleEvent({
            functionKey: 'fulfil',
            event: { schedule: 'rate(1 hour)', role: 'x', batchSize: 1 },
          }),
        'EVENTBRIDGE_RULE_UNSUPPORTED_PROPERTY',
        'Function "fulfil": "batchSize" applies to Custom Event Bus subscribers only, and the Framework treats "default" as a Classic event bus.',
      )
    })

    it('requires pattern or schedule', () => {
      expectError(
        () => compile({ eventBus: 'orders' }),
        'EVENTBRIDGE_RULE_PATTERN_OR_SCHEDULE_REQUIRED',
        'Function "fulfil": an eventBridge event on a Classic event bus needs "pattern" or "schedule".',
      )
    })
  })
})

describe('eventBridge Classic compilation', () => {
  const classicEvents = [
    { schedule: 'rate(10 minutes)' },
    {
      pattern: {
        source: ['aws.cloudformation'],
        'detail-type': ['AWS API Call via CloudTrail'],
      },
    },
    { eventBus: 'my-custom-event-bus', schedule: 'rate(10 minutes)' },
    { eventBus: 'default', schedule: 'rate(10 minutes)' },
    {
      eventBus: 'arn:aws:events:us-east-1:111122223333:event-bus/default',
      schedule: 'rate(10 minutes)',
    },
    { schedule: 'rate(10 minutes)', enabled: false },
    { schedule: 'rate(10 minutes)', name: 'my-custom-rule' },
    { schedule: 'rate(10 minutes)', description: 'My Event Rule description' },
    { schedule: 'rate(10 minutes)', input: { key1: 'value1' } },
    { schedule: 'rate(10 minutes)', inputPath: '$.stageVariables' },
    {
      schedule: 'rate(10 minutes)',
      inputTransformer: {
        inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        inputPathsMap: { eventTime: '$.time' },
      },
    },
    {
      schedule: 'rate(10 minutes)',
      retryPolicy: { maximumEventAge: 7200, maximumRetryAttempts: 9 },
      deadLetterQueueArn: 'arn:aws:sqs:us-east-1:111122223333:my-dlq',
    },
    {
      pattern: {
        $or: [
          { detail: { eventSource: ['saas.external'] } },
          { source: ['aws.ec2'] },
        ],
      },
    },
    { eventBus: { Ref: 'ImportedEventBus' }, schedule: 'rate(10 minutes)' },
    {
      eventBus: { 'Fn::GetAtt': ['ImportedEventBus', 'Name'] },
      pattern: { source: ['aws.ec2'] },
    },
  ]

  const setFunctions = (serverless, events) => {
    serverless.service.functions = {
      first: {
        name: 'orders-dev-first',
        events: events.map((eventBridge) => ({ eventBridge })),
      },
    }
  }

  it('compiles the native CloudFormation template exactly as before', () => {
    const { serverless, plugin } = createPlugin()
    setFunctions(serverless, classicEvents)
    plugin.compileEventBridgeEvents()
    expect(
      serverless.service.provider.compiledCloudFormationTemplate,
    ).toMatchSnapshot()
  })

  it('compiles the custom resource template exactly as before', () => {
    addCustomResourceToService.mockClear()
    const { serverless, plugin } = createPlugin()
    serverless.service.provider.eventBridge = { useCloudFormation: false }
    setFunctions(serverless, [
      { schedule: 'rate(10 minutes)' },
      { eventBus: 'my-custom-event-bus', pattern: { source: ['aws.ec2'] } },
      {
        eventBus:
          'arn:aws:events:us-east-1:111122223333:event-bus/my-custom-event-bus',
        schedule: 'rate(10 minutes)',
        input: { key1: 'value1' },
      },
    ])
    plugin.compileEventBridgeEvents()
    expect({
      template: serverless.service.provider.compiledCloudFormationTemplate,
      customResourceStatements: addCustomResourceToService.mock.calls.map(
        ([, name, statements]) => ({ name, statements }),
      ),
    }).toMatchSnapshot()
  })
})

describe('eventBridge config schema', () => {
  let validate

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
    serverless.service.provider.name = 'aws'
    serverless.setProvider(
      'aws',
      new AwsProvider(serverless, { stage: 'dev', region: 'us-east-1' }),
    )
    const defineFunctionEvent = jest.spyOn(
      serverless.configSchemaHandler,
      'defineFunctionEvent',
    )
    new AwsCompileEventBridgeEvents(serverless, {})
    const [, , eventSchema] = defineFunctionEvent.mock.calls.find(
      ([provider, name]) => provider === 'aws' && name === 'eventBridge',
    )
    // Mirror the runtime AJV configuration from
    // lib/classes/config-schema-handler/resolve-ajv-validate.js
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: false,
      strictRequired: false,
    })
    ajv.addKeyword(regexpKeyword)
    validate = ajv.compile({
      ...eventSchema,
      definitions: serverless.configSchemaHandler.schema.definitions,
    })
  })

  it.each([
    [
      'a GetAtt of EventBusArn',
      { eventBus: { 'Fn::GetAtt': ['X', 'EventBusArn'] } },
    ],
    [
      'a GetAtt of Name',
      { eventBus: { 'Fn::GetAtt': ['X', 'Name'] }, schedule: 'rate(1 hour)' },
    ],
    ['a subscriber without a pattern', { eventBus: NEW_BUS_ARN }],
    ['lowercase ordering fifo', { eventBus: NEW_BUS_ARN, ordering: 'fifo' }],
    [
      'uppercase ordering UNORDERED',
      { eventBus: NEW_BUS_ARN, ordering: 'UNORDERED' },
    ],
    [
      'resumePosition last_processed',
      { eventBus: NEW_BUS_ARN, resumePosition: 'last_processed' },
    ],
    [
      'resumePosition LATEST',
      { eventBus: NEW_BUS_ARN, resumePosition: 'LATEST' },
    ],
    ['batchSize 100', { eventBus: NEW_BUS_ARN, batchSize: 100 }],
    [
      'maximumBatchingWindow 0',
      { eventBus: NEW_BUS_ARN, maximumBatchingWindow: 0 },
    ],
    [
      'maximumBatchingWindow 300',
      { eventBus: NEW_BUS_ARN, maximumBatchingWindow: 300 },
    ],
    ['async', { eventBus: NEW_BUS_ARN, async: true }],
    [
      'a role ARN',
      { eventBus: NEW_BUS_ARN, role: 'arn:aws:iam::111122223333:role/r' },
    ],
    [
      'a role intrinsic',
      { eventBus: NEW_BUS_ARN, role: { 'Fn::GetAtt': ['Role', 'Arn'] } },
    ],
    [
      'a pattern on a payload field',
      { eventBus: NEW_BUS_ARN, pattern: { orderId: [{ exists: true }] } },
    ],
  ])('accepts %s', (_label, event) => {
    expect(validate(event)).toBe(true)
  })

  it.each([
    ['batchSize 101', { eventBus: NEW_BUS_ARN, batchSize: 101 }],
    ['batchSize 0', { eventBus: NEW_BUS_ARN, batchSize: 0 }],
    [
      'maximumBatchingWindow 301',
      { eventBus: NEW_BUS_ARN, maximumBatchingWindow: 301 },
    ],
    ['ordering sideways', { eventBus: NEW_BUS_ARN, ordering: 'sideways' }],
    [
      'resumePosition earliest',
      { eventBus: NEW_BUS_ARN, resumePosition: 'earliest' },
    ],
    ['a role that is not an ARN', { eventBus: NEW_BUS_ARN, role: 'delivery' }],
    [
      'a GetAtt of another attribute',
      { eventBus: { 'Fn::GetAtt': ['X', 'Arn'] } },
    ],
  ])('rejects %s', (_label, event) => {
    expect(validate(event)).toBe(false)
  })
})

// Drives the real ConfigSchemaHandler, so the assertions cover the messages
// users see, after normalize-ajv-errors.js has filtered them.
describe('eventBridge config validation through configSchemaHandler', () => {
  let schemaCacheDir
  let previousSchemaCacheBaseDir

  beforeAll(() => {
    // Keep the compiled-schema cache out of ~/.serverless
    schemaCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-schema-cache-'))
    previousSchemaCacheBaseDir = process.env.SLS_SCHEMA_CACHE_BASE_DIR
    process.env.SLS_SCHEMA_CACHE_BASE_DIR = schemaCacheDir
  })

  afterAll(() => {
    if (previousSchemaCacheBaseDir === undefined) {
      delete process.env.SLS_SCHEMA_CACHE_BASE_DIR
    } else {
      process.env.SLS_SCHEMA_CACHE_BASE_DIR = previousSchemaCacheBaseDir
    }
    fs.rmSync(schemaCacheDir, { recursive: true, force: true })
  })

  // Returns the messages the handler reports; [] when the config is valid.
  const validationMessages = async (eventBridge) => {
    const configurationInput = {
      service: 'orders',
      configValidationMode: 'error',
      provider: { name: 'aws', region: 'us-east-1' },
      functions: {
        fulfil: { handler: 'index.handler', events: [{ eventBridge }] },
      },
    }
    const serverless = new Serverless({
      commands: [],
      options: {},
      servicePath: process.cwd(),
      serviceConfigFileName: 'serverless.yml',
      service: configurationInput,
    })
    serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
    serverless.service.loadServiceFileParam()
    serverless.setProvider(
      'aws',
      new AwsProvider(serverless, { stage: 'dev', region: 'us-east-1' }),
    )
    new AwsCompileEventBridgeEvents(serverless, {})
    const handleErrorMessages = jest.spyOn(
      serverless.configSchemaHandler,
      'handleErrorMessages',
    )
    try {
      await serverless.configSchemaHandler.validateConfig(configurationInput)
    } catch (error) {
      if (error.code !== 'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION') {
        throw error
      }
    }
    return handleErrorMessages.mock.calls.flatMap(([messages]) => messages)
  }

  const unrecognizedFoo = [
    "at 'functions.fulfil.events.0.eventBridge.pattern': unrecognized property 'foo'",
  ]

  it.each([
    ['a literal Classic ARN', { eventBus: CLASSIC_BUS_ARN }],
    ['no eventBus', {}],
    ['a Classic bus name', { eventBus: 'orders' }],
    ['a GetAtt of Name', { eventBus: { 'Fn::GetAtt': ['OrdersBus', 'Name'] } }],
  ])(
    'reports only the unknown top-level pattern key with %s',
    async (_label, event) => {
      expect(
        await validationMessages({ ...event, pattern: { foo: [1] } }),
      ).toEqual(unrecognizedFoo)
    },
  )

  it('accepts the envelope keys with a Classic bus', async () => {
    expect(
      await validationMessages({
        eventBus: CLASSIC_BUS_ARN,
        pattern: { source: ['orders'], detail: { id: [1] } },
      }),
    ).toEqual([])
  })

  it.each([
    ['a new-bus ARN', { eventBus: NEW_BUS_ARN }],
    [
      'a GetAtt of EventBusArn',
      { eventBus: { 'Fn::GetAtt': ['OrdersBus', 'EventBusArn'] } },
    ],
    ['a Ref', { eventBus: { Ref: 'OrdersBus' } }],
  ])('accepts any top-level pattern key with %s', async (_label, event) => {
    expect(
      await validationMessages({
        ...event,
        pattern: { total: [{ numeric: ['>', 500] }] },
      }),
    ).toEqual([])
  })

  it('accepts a subscriber name of up to 256 characters', async () => {
    expect(
      await validationMessages({
        eventBus: NEW_BUS_ARN,
        name: 'a'.repeat(256),
      }),
    ).toEqual([])
  })

  it('keeps the 64-character limit on Classic rule names', async () => {
    expect(
      await validationMessages({
        eventBus: CLASSIC_BUS_ARN,
        name: 'a'.repeat(65),
      }),
    ).toEqual([
      "at 'functions.fulfil.events.0.eventBridge.name': must NOT have more than 64 characters",
    ])
  })

  it('reports a subscriber name over 256 characters', async () => {
    expect(
      await validationMessages({
        eventBus: NEW_BUS_ARN,
        name: 'a'.repeat(257),
      }),
    ).toEqual([
      "at 'functions.fulfil.events.0.eventBridge.name': must NOT have more than 256 characters",
    ])
  })

  it('reports a Classic rule name over 256 characters once', async () => {
    expect(
      await validationMessages({
        eventBus: CLASSIC_BUS_ARN,
        name: 'a'.repeat(257),
      }),
    ).toEqual([
      "at 'functions.fulfil.events.0.eventBridge.name': must NOT have more than 64 characters",
    ])
  })

  it('reports a batchSize above 100', async () => {
    expect(
      await validationMessages({ eventBus: NEW_BUS_ARN, batchSize: 101 }),
    ).toEqual([
      "at 'functions.fulfil.events.0.eventBridge.batchSize': must be <= 100",
    ])
  })
})

describe('eventBridge delivery role and wiring', () => {
  const DLQ_ARN = 'arn:aws:sqs:us-east-1:111122223333:orders-dlq'
  const ROLE_ARN = 'arn:aws:iam::111122223333:role/orders-delivery'
  const getAtt = (logicalId) => ({ 'Fn::GetAtt': [logicalId, 'Arn'] })
  const invokeArns = (logicalId) => [
    getAtt(logicalId),
    { 'Fn::Join': [':', [getAtt(logicalId), '*']] },
  ]

  let serverless
  let plugin

  beforeEach(() => {
    log.warning.mockClear()
    ;({ serverless, plugin } = createPlugin())
    serverless.service.service = 'orders'
    serverless.service.provider.stage = 'dev'
  })

  const compile = (functions, provider = {}) => {
    serverless.service.functions = Object.fromEntries(
      Object.entries(functions).map(([key, events]) => [
        key,
        {
          name: `orders-dev-${key}`,
          timeout: 6,
          events: events.map((eventBridge) => ({ eventBridge })),
        },
      ]),
    )
    Object.assign(serverless.service.provider, provider)
    plugin.compileEventBridgeEvents()
    return serverless.service.provider.compiledCloudFormationTemplate.Resources
  }

  const ofType = (resources, type) =>
    Object.entries(resources).filter(([, resource]) => resource.Type === type)

  it('rejects a delivery role name over 64 characters', () => {
    // customer-notifications-service-with-long-name-dev-us-east-1-eventBridge
    serverless.service.service = 'customer-notifications-service-with-long-name'
    expect(() => compile({ alpha: [{ eventBus: NEW_BUS_ARN }] })).toThrow(
      expect.objectContaining({
        code: 'EVENTBRIDGE_DELIVERY_ROLE_NAME_TOO_LONG',
        message: expect.stringContaining('71 characters long'),
      }),
    )
  })

  it('accepts a long service name when every event sets role', () => {
    serverless.service.service = 'customer-notifications-service-with-long-name'
    expect(() =>
      compile({ alpha: [{ eventBus: NEW_BUS_ARN, role: ROLE_ARN }] }),
    ).not.toThrow()
  })

  it('rejects a subscriber name whose logical ID exceeds 255 characters', () => {
    expect(() =>
      compile({ alpha: [{ eventBus: NEW_BUS_ARN, name: 'a'.repeat(235) }] }),
    ).toThrow(
      expect.objectContaining({ code: 'EVENTBRIDGE_SUBSCRIBER_NAME_TOO_LONG' }),
    )
    expect(() =>
      compile({ alpha: [{ eventBus: NEW_BUS_ARN, name: 'a'.repeat(234) }] }),
    ).not.toThrow()
  })

  it('rejects two subscriber names that compile to one logical ID', () => {
    expect(() =>
      compile({
        alpha: [{ eventBus: NEW_BUS_ARN, name: 'orders-v2' }],
        beta: [{ eventBus: NEW_BUS_ARN, name: 'orders_v2' }],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'EVENTBRIDGE_SUBSCRIBER_DUPLICATE_LOGICAL_ID',
      }),
    )
  })

  it('compiles subscribers and one delivery role for two functions', () => {
    const resources = compile({
      alpha: [{ eventBus: NEW_BUS_ARN, deadLetterQueueArn: DLQ_ARN }],
      beta: [{ eventBus: NEW_BUS_ARN }],
    })

    const subscribers = ofType(resources, 'AWS::EventsV2::Subscriber')
    expect(subscribers).toHaveLength(2)
    subscribers.forEach(([, subscriber]) =>
      expect(subscriber.Properties.InvokeConfiguration.RoleArn).toEqual(
        getAtt('IamRoleEventBridgeDelivery'),
      ),
    )
    expect(ofType(resources, 'AWS::Lambda::Permission')).toHaveLength(0)
    expect(ofType(resources, 'AWS::Events::Rule')).toHaveLength(0)
    expect(ofType(resources, 'AWS::IAM::Role')).toHaveLength(1)

    expect(resources.IamRoleEventBridgeDelivery).toEqual({
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: ['events.amazonaws.com'] },
              Action: ['sts:AssumeRole'],
              Condition: {
                StringEquals: {
                  'aws:SourceAccount': { Ref: 'AWS::AccountId' },
                },
                ArnLike: {
                  'aws:SourceArn': {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:subscriber/*',
                  },
                },
              },
            },
          ],
        },
        Policies: [
          {
            PolicyName: {
              'Fn::Join': ['-', ['orders', 'dev', 'eventBridgeDelivery']],
            },
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['lambda:InvokeFunction'],
                  Resource: [
                    ...invokeArns('AlphaLambdaFunction'),
                    ...invokeArns('BetaLambdaFunction'),
                  ],
                },
                {
                  Effect: 'Allow',
                  Action: ['sqs:SendMessage'],
                  Resource: [DLQ_ARN],
                },
              ],
            },
          },
        ],
        Path: '/',
        RoleName: {
          'Fn::Join': [
            '-',
            ['orders', 'dev', { Ref: 'AWS::Region' }, 'eventBridge'],
          ],
        },
      },
    })
  })

  it('grants one invoke pair per function and one entry per distinct DLQ', () => {
    const resources = compile({
      alpha: [
        { eventBus: NEW_BUS_ARN, deadLetterQueueArn: { Ref: 'OrdersDlqArn' } },
        { eventBus: NEW_BUS_ARN, deadLetterQueueArn: { Ref: 'OrdersDlqArn' } },
      ],
    })

    const subscribers = ofType(resources, 'AWS::EventsV2::Subscriber')
    expect(subscribers).toHaveLength(2)
    const [[firstId, first], [secondId, second]] = subscribers
    expect(firstId).not.toBe(secondId)
    expect(first.Properties.Name).not.toBe(second.Properties.Name)

    const [invoke, sqs] =
      resources.IamRoleEventBridgeDelivery.Properties.Policies[0].PolicyDocument
        .Statement
    expect(invoke.Resource).toEqual(invokeArns('AlphaLambdaFunction'))
    expect(sqs.Resource).toEqual([{ Ref: 'OrdersDlqArn' }])
  })

  it('omits the sqs statement without a DLQ', () => {
    const resources = compile({ alpha: [{ eventBus: NEW_BUS_ARN }] })
    expect(
      resources.IamRoleEventBridgeDelivery.Properties.Policies[0].PolicyDocument
        .Statement,
    ).toEqual([
      {
        Effect: 'Allow',
        Action: ['lambda:InvokeFunction'],
        Resource: invokeArns('AlphaLambdaFunction'),
      },
    ])
  })

  it('compiles a Classic and a new-bus event on one function side by side', () => {
    const resources = compile({
      alpha: [{ schedule: 'rate(10 minutes)' }, { eventBus: NEW_BUS_ARN }],
    })
    expect(ofType(resources, 'AWS::Events::Rule')).toHaveLength(1)
    expect(ofType(resources, 'AWS::Lambda::Permission')).toHaveLength(1)
    expect(ofType(resources, 'AWS::EventsV2::Subscriber')).toHaveLength(1)
    expect(resources.IamRoleEventBridgeDelivery).toBeDefined()
  })

  it('grants only the events that use the generated role', () => {
    const resources = compile({
      alpha: [{ eventBus: NEW_BUS_ARN, role: ROLE_ARN }],
      beta: [{ eventBus: NEW_BUS_ARN, deadLetterQueueArn: DLQ_ARN }],
      gamma: [
        { eventBus: NEW_BUS_ARN, role: ROLE_ARN, deadLetterQueueArn: 'x' },
      ],
    })
    const [invoke, sqs] =
      resources.IamRoleEventBridgeDelivery.Properties.Policies[0].PolicyDocument
        .Statement
    expect(invoke.Resource).toEqual(invokeArns('BetaLambdaFunction'))
    expect(sqs.Resource).toEqual([DLQ_ARN])
  })

  it('adds no delivery role when every new-bus event sets role', () => {
    const resources = compile({
      alpha: [{ eventBus: NEW_BUS_ARN, role: ROLE_ARN }],
      beta: [{ eventBus: NEW_BUS_ARN, role: { 'Fn::GetAtt': ['R', 'Arn'] } }],
    })
    expect(ofType(resources, 'AWS::EventsV2::Subscriber')).toHaveLength(2)
    expect(resources.IamRoleEventBridgeDelivery).toBeUndefined()
    expect(ofType(resources, 'AWS::IAM::Role')).toHaveLength(0)
  })

  it('applies provider.iam.role path and permissionsBoundary', () => {
    const resources = compile(
      { alpha: [{ eventBus: NEW_BUS_ARN }] },
      {
        iam: {
          role: {
            path: '/team/',
            permissionsBoundary: 'arn:aws:iam::111122223333:policy/pb',
            permissionBoundary: 'arn:aws:iam::111122223333:policy/legacy',
          },
        },
        rolePermissionsBoundary: 'arn:aws:iam::111122223333:policy/provider',
      },
    )
    const { Properties } = resources.IamRoleEventBridgeDelivery
    expect(Properties.Path).toBe('/team/')
    expect(Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::111122223333:policy/pb',
    )
    expect(Properties.RoleName).toEqual({
      'Fn::Join': [
        '-',
        ['orders', 'dev', { Ref: 'AWS::Region' }, 'eventBridge'],
      ],
    })
  })

  it('falls back to provider.iam.role.permissionBoundary', () => {
    const resources = compile(
      { alpha: [{ eventBus: NEW_BUS_ARN }] },
      {
        iam: {
          role: { permissionBoundary: 'arn:aws:iam::111122223333:policy/pb' },
        },
        rolePermissionsBoundary: 'arn:aws:iam::111122223333:policy/provider',
      },
    )
    expect(
      resources.IamRoleEventBridgeDelivery.Properties.PermissionsBoundary,
    ).toBe('arn:aws:iam::111122223333:policy/pb')
  })

  it('falls back to provider.rolePermissionsBoundary', () => {
    const resources = compile(
      { alpha: [{ eventBus: NEW_BUS_ARN }] },
      { rolePermissionsBoundary: 'arn:aws:iam::111122223333:policy/provider' },
    )
    expect(
      resources.IamRoleEventBridgeDelivery.Properties.PermissionsBoundary,
    ).toBe('arn:aws:iam::111122223333:policy/provider')
  })

  it('sets no PermissionsBoundary when none is configured', () => {
    const resources = compile({ alpha: [{ eventBus: NEW_BUS_ARN }] })
    expect(resources.IamRoleEventBridgeDelivery.Properties).not.toHaveProperty(
      'PermissionsBoundary',
    )
  })

  it('generates the delivery role when provider.iam.role is an existing role', () => {
    const resources = compile(
      { alpha: [{ eventBus: NEW_BUS_ARN }] },
      {
        iam: { role: ROLE_ARN },
        rolePermissionsBoundary: 'arn:aws:iam::111122223333:policy/provider',
      },
    )
    const { Properties } = resources.IamRoleEventBridgeDelivery
    expect(Properties.Path).toBe('/')
    expect(Properties.PermissionsBoundary).toBe(
      'arn:aws:iam::111122223333:policy/provider',
    )
  })

  it('adds no resources without new-bus events', () => {
    const resources = compile({ alpha: [{ schedule: 'rate(10 minutes)' }] })
    expect(
      Object.values(resources)
        .map(({ Type }) => Type)
        .sort(),
    ).toEqual(['AWS::Events::Rule', 'AWS::Lambda::Permission'])
  })

  it('caps the default provider timeout at 30 seconds and warns', () => {
    serverless.service.functions = {
      alpha: {
        name: 'orders-dev-alpha',
        events: [{ eventBridge: { eventBus: NEW_BUS_ARN } }],
      },
    }
    serverless.service.provider.timeout = 60
    // compile/functions.js runs before compileEvents and applies this default.
    const functionObj = serverless.service.functions.alpha
    if (!functionObj.timeout) {
      functionObj.timeout = serverless.service.provider.timeout || 6
    }
    plugin.compileEventBridgeEvents()

    const [[, subscriber]] = ofType(
      serverless.service.provider.compiledCloudFormationTemplate.Resources,
      'AWS::EventsV2::Subscriber',
    )
    expect(subscriber.Properties.InvokeConfiguration.LambdaParameters).toEqual({
      InvocationType: 'REQUEST_RESPONSE',
      InvocationTimeoutSeconds: '30',
    })
    expect(log.warning).toHaveBeenCalledWith(
      'Function "alpha" has a 60s timeout, but EventBridge waits at most 30s for a synchronous subscriber and retries after that, so one event can run concurrently more than once. Set the function timeout to 30s or less, or set "async: true".',
    )
  })
})

const { buildDeliveryRole } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/delivery-role.js')

describe('buildDeliveryRole', () => {
  let naming

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
    serverless.service.service = 'orders'
    naming = new AwsProvider(serverless, { stage: 'dev', region: 'us-east-1' })
      .naming
  })

  it('dedupes function logical IDs and DLQ ARNs', () => {
    const role = buildDeliveryRole({
      naming,
      functionLogicalIds: ['AlphaLambdaFunction', 'AlphaLambdaFunction'],
      dlqArns: [{ Ref: 'Dlq' }, { Ref: 'Dlq' }, 'arn:aws:sqs:x'],
      iamRole: {},
    })
    const getAtt = { 'Fn::GetAtt': ['AlphaLambdaFunction', 'Arn'] }
    expect(role.Properties.Policies[0].PolicyDocument.Statement).toEqual([
      {
        Effect: 'Allow',
        Action: ['lambda:InvokeFunction'],
        Resource: [getAtt, { 'Fn::Join': [':', [getAtt, '*']] }],
      },
      {
        Effect: 'Allow',
        Action: ['sqs:SendMessage'],
        Resource: [{ Ref: 'Dlq' }, 'arn:aws:sqs:x'],
      },
    ])
  })

  it('uses rolePermissionsBoundary when iamRole sets none', () => {
    const role = buildDeliveryRole({
      naming,
      functionLogicalIds: ['AlphaLambdaFunction'],
      dlqArns: [],
      iamRole: {},
      rolePermissionsBoundary: { Ref: 'Boundary' },
    })
    expect(role.Properties.PermissionsBoundary).toEqual({ Ref: 'Boundary' })
  })
})
