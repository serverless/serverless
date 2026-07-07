import { describe, test, expect } from '@jest/globals'
import { select } from '../../../../../lib/plugins/agent/lib/select.js'
import { discoverResources } from '../../../../../lib/plugins/agent/lib/discover-resources.js'
import * as registry from '../../../../../lib/plugins/agent/lib/registry/index.js'
import ServerlessError from '../../../../../lib/serverless-error.js'

// Hand-built index fixtures matching the discover-resources.js descriptor
// shape: { logicalId, physicalId, type, status, awsService, category }.
// Uses the REAL registry's categories/services (functions, iam, api, events,
// storage -- the 9-service subset wired up so far) so this test suite keeps
// working unchanged as later tasks add more registry entries.
const RESOURCES = [
  {
    logicalId: 'CreateOrderLambdaFunction',
    physicalId: 'orders-api-dev-createOrder',
    type: 'AWS::Lambda::Function',
    status: 'UPDATE_COMPLETE',
    awsService: 'lambda',
    category: 'functions',
  },
  {
    logicalId: 'GetOrderLambdaFunction',
    physicalId: 'orders-api-dev-getOrder',
    type: 'AWS::Lambda::Function',
    status: 'UPDATE_COMPLETE',
    awsService: 'lambda',
    category: 'functions',
  },
  {
    logicalId: 'HttpApi',
    physicalId: 'a1b2c3d4e5',
    type: 'AWS::ApiGatewayV2::Api',
    status: 'CREATE_COMPLETE',
    awsService: 'apigatewayv2',
    category: 'api',
  },
  {
    logicalId: 'OrderEventsTopic',
    physicalId: 'arn:aws:sns:us-east-1:123456789012:orders-api-dev-OrderEvents',
    type: 'AWS::SNS::Topic',
    status: 'CREATE_COMPLETE',
    // Not wired into the registry yet (sns lands in a later task) -- keep it
    // out of RESOURCES-that-matter for --aws-services sns, but note it here
    // if/when the registry grows; for now events axis is exercised via
    // eventbridge below.
    awsService: 'sns',
    category: 'events',
  },
  {
    logicalId: 'OrderCreatedRule',
    physicalId: 'orders-api-dev-OrderCreatedRule',
    type: 'AWS::Events::Rule',
    status: 'CREATE_COMPLETE',
    awsService: 'eventbridge',
    category: 'events',
  },
  {
    logicalId: 'OrdersRole',
    physicalId: 'arn:aws:iam::123456789012:role/orders-api-dev-OrdersRole',
    type: 'AWS::IAM::Role',
    status: 'CREATE_COMPLETE',
    awsService: 'iam',
    category: 'iam',
  },
  {
    logicalId: 'OrdersBucket',
    physicalId: 'orders-api-dev-ordersbucket',
    type: 'AWS::S3::Bucket',
    status: 'CREATE_COMPLETE',
    awsService: 's3',
    category: 'storage',
  },
  {
    logicalId: 'OrdersTable',
    physicalId: 'orders-api-dev-OrdersTable',
    type: 'AWS::DynamoDB::Table',
    status: 'CREATE_COMPLETE',
    awsService: 'dynamodb',
    category: 'storage',
  },
  {
    logicalId: 'SomeCustomResource',
    physicalId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/custom',
    type: 'Custom::SomeUnsupportedThing',
    status: 'CREATE_COMPLETE',
    // `other`-bucket resources have no awsService (see discover-resources.js).
    category: 'other',
  },
]

function byLogicalId(...ids) {
  return RESOURCES.filter((r) => ids.includes(r.logicalId))
}

describe('select', () => {
  describe('axis 1 -- category flags', () => {
    test('single category selects only that category', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true },
      })
      expect(result.selected).toEqual(
        byLogicalId('CreateOrderLambdaFunction', 'GetOrderLambdaFunction'),
      )
    })

    test('multiple categories union', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true, storage: true },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
          'OrdersTable',
        ),
      )
    })

    test('--all selects every known category (derived from the registry, not hardcoded)', () => {
      const result = select({ resources: RESOURCES, options: { all: true } })
      const expectedCategories = new Set(
        registry.REGISTRY_ENTRIES.map((e) => e.category),
      )
      const expected = RESOURCES.filter((r) =>
        expectedCategories.has(r.category),
      )
      expect(result.selected).toEqual(expected)
      // Sanity: `other` is never included even under --all.
      expect(result.selected.some((r) => r.category === 'other')).toBe(false)
    })

    test('neither axis nor --name given => empty selection', () => {
      const result = select({ resources: RESOURCES, options: {} })
      expect(result.selected).toEqual([])
    })
  })

  describe('axis 2 -- --aws-services', () => {
    test('parses a simple comma list', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: 'lambda,s3' },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('trims whitespace around tokens', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: ' lambda , s3 ' },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('drops empty segments from a trailing comma', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: 'lambda,s3,' },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('is case-insensitive', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: 'LAMBDA,S3' },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('resolves aliases via the registry (events -> eventbridge, alb -> elbv2)', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: 'events' },
      })
      expect(result.selected).toEqual(byLogicalId('OrderCreatedRule'))
    })

    test('accepts an array of tokens (not just a string)', () => {
      const result = select({
        resources: RESOURCES,
        options: { awsServices: ['lambda', 's3'] },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('unknown token throws a structured error listing supported services', () => {
      let thrown
      try {
        select({
          resources: RESOURCES,
          options: { awsServices: 'not-a-real-service' },
        })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(ServerlessError)
      expect(thrown.message).toMatch(/not-a-real-service/)
      // Every DISPATCHABLE canonical service token in the registry should be
      // listed -- excluding null, which index-only entries (e.g.
      // lambda-microvms's MicrovmImage/NetworkConnector; see
      // registry/lambda-microvms.js) carry since they have no describe
      // capability and must never appear as a selectable service token.
      for (const service of new Set(
        registry.REGISTRY_ENTRIES.map((e) => e.awsService).filter(Boolean),
      )) {
        expect(thrown.message).toContain(service)
      }
    })
  })

  describe('union across axes', () => {
    test('category + service (--functions --aws-services s3)', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true, awsServices: 's3' },
      })
      expect(result.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersBucket',
        ),
      )
    })

    test('--functions --aws-services iam is order-independent and identical to --iam --functions', () => {
      const a = select({
        resources: RESOURCES,
        options: { functions: true, awsServices: 'iam' },
      })
      const b = select({
        resources: RESOURCES,
        options: { iam: true, functions: true },
      })
      const c = select({
        resources: RESOURCES,
        options: { functions: true, iam: true },
      })
      expect(a.selected).toEqual(
        byLogicalId(
          'CreateOrderLambdaFunction',
          'GetOrderLambdaFunction',
          'OrdersRole',
        ),
      )
      expect(b.selected).toEqual(a.selected)
      expect(c.selected).toEqual(b.selected)
    })
  })

  describe('--name', () => {
    test('narrows the selection to the named resource within a flagged category', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true, name: ['CreateOrderLambdaFunction'] },
      })
      expect(result.selected).toEqual(byLogicalId('CreateOrderLambdaFunction'))
    })

    test('with axis flags, --name is a pure filter -- it does not pull in resources outside the flagged axes', () => {
      // OrdersBucket is valid and describable, but storage isn't flagged and
      // isn't in --aws-services, so --functions --name OrdersBucket must
      // filter down to nothing rather than union it in.
      const result = select({
        resources: RESOURCES,
        options: { functions: true, name: ['OrdersBucket'] },
      })
      expect(result.selected).toEqual([])
    })

    test('repeatable --name unions across multiple names', () => {
      const result = select({
        resources: RESOURCES,
        options: {
          all: true,
          name: ['CreateOrderLambdaFunction', 'OrdersBucket'],
        },
      })
      expect(result.selected).toEqual(
        byLogicalId('CreateOrderLambdaFunction', 'OrdersBucket'),
      )
    })

    test('splits a comma-joined --name value into multiple names (CoreRunner delegation artifact)', () => {
      // The CoreRunner->framework delegation re-serializes options through a
      // yargs argv round-trip that String()-joins a multi-value array into ONE
      // comma-delimited token, so `--name A --name B` can arrive as the
      // single-element array `['A,B']`. normalizeNames must recover both.
      const result = select({
        resources: RESOURCES,
        options: {
          all: true,
          name: ['CreateOrderLambdaFunction,OrdersBucket'],
        },
      })
      expect(result.selected).toEqual(
        byLogicalId('CreateOrderLambdaFunction', 'OrdersBucket'),
      )
    })

    test('splits a comma-joined --name value in alone-mode too, trimming whitespace', () => {
      const result = select({
        resources: RESOURCES,
        options: { name: [' OrdersTable , OrdersRole '] },
      })
      expect(result.selected).toEqual(byLogicalId('OrdersTable', 'OrdersRole'))
    })

    test('alone-mode: --name with no axis flags auto-selects the named resource', () => {
      const result = select({
        resources: RESOURCES,
        options: { name: ['OrdersTable'] },
      })
      expect(result.selected).toEqual(byLogicalId('OrdersTable'))
    })

    test('alone-mode unions across multiple --name', () => {
      const result = select({
        resources: RESOURCES,
        options: { name: ['OrdersTable', 'OrdersRole'] },
      })
      expect(result.selected).toEqual(byLogicalId('OrdersTable', 'OrdersRole'))
    })

    test('unknown logicalId throws a structured error listing valid logical IDs', () => {
      let thrown
      try {
        select({ resources: RESOURCES, options: { name: ['NoSuchThing'] } })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(ServerlessError)
      expect(thrown.message).toMatch(/NoSuchThing/)
      expect(thrown.message).toContain('OrdersTable')
    })

    test('--name matching an `other`-bucket resource throws a not-describable error', () => {
      let thrown
      try {
        select({
          resources: RESOURCES,
          options: { name: ['SomeCustomResource'] },
        })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(ServerlessError)
      expect(thrown.message).toMatch(/SomeCustomResource/)
      expect(thrown.message).toMatch(/not describable|unsupported/i)
    })

    test('--name is case-sensitive on logicalId', () => {
      expect(() =>
        select({ resources: RESOURCES, options: { name: ['ordersTable'] } }),
      ).toThrow(ServerlessError)
    })
  })

  describe('axis expansion requires describability (awsService present)', () => {
    // A folded sub-resource must never be expanded on a category axis, even if
    // (in some other design) it carried a describable category. This proves
    // the gate is on `awsService`, not category alone.
    test('a sub-resource carrying a describable category but no awsService is excluded from --functions', () => {
      const resources = [
        {
          logicalId: 'CreateOrderLambdaFunction',
          physicalId: 'orders-api-dev-createOrder',
          type: 'AWS::Lambda::Function',
          status: 'CREATE_COMPLETE',
          awsService: 'lambda',
          category: 'functions',
          stack: 'orders-api-dev',
        },
        {
          logicalId: 'CreateOrderLambdaPermission',
          physicalId: 'orders-api-dev-createOrder-perm',
          type: 'AWS::Lambda::Permission',
          status: 'CREATE_COMPLETE',
          // Pathological: describable category but not actually describable.
          awsService: null,
          category: 'functions',
          stack: 'orders-api-dev',
        },
      ]
      const result = select({ resources, options: { functions: true } })
      expect(result.selected.map((r) => r.logicalId)).toEqual([
        'CreateOrderLambdaFunction',
      ])
    })
  })

  describe('--name ambiguity across nested stacks', () => {
    const CROSS_STACK = [
      {
        logicalId: 'HelloLambdaFunction',
        physicalId: 'svc-dev-hello-root',
        type: 'AWS::Lambda::Function',
        status: 'CREATE_COMPLETE',
        awsService: 'lambda',
        category: 'functions',
        stack: 'svc-dev',
      },
      {
        logicalId: 'HelloLambdaFunction',
        physicalId: 'svc-dev-hello-nested',
        type: 'AWS::Lambda::Function',
        status: 'CREATE_COMPLETE',
        awsService: 'lambda',
        category: 'functions',
        stack: 'svc-dev-NestedStackOne',
      },
    ]

    test('a --name matching a logicalId in two stacks throws listing stack-qualified candidates', () => {
      let thrown
      try {
        select({
          resources: CROSS_STACK,
          options: { name: ['HelloLambdaFunction'] },
        })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(ServerlessError)
      expect(thrown.code).toBe('AGENT_INSPECT_AMBIGUOUS_NAME')
      expect(thrown.message).toMatch(/HelloLambdaFunction/)
      expect(thrown.message).toContain('svc-dev/HelloLambdaFunction')
      expect(thrown.message).toContain(
        'svc-dev-NestedStackOne/HelloLambdaFunction',
      )
    })
  })

  describe('IAM-inline decision', () => {
    test('true when functions selected and iam is not', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true },
      })
      expect(result.inlineFunctionRole).toBe(true)
    })

    test('false when both functions and iam are selected (via flags)', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true, iam: true },
      })
      expect(result.inlineFunctionRole).toBe(false)
    })

    test('false when iam is selected via --aws-services rather than --iam', () => {
      const result = select({
        resources: RESOURCES,
        options: { functions: true, awsServices: 'iam' },
      })
      expect(result.inlineFunctionRole).toBe(false)
    })

    test('false when functions are not selected at all', () => {
      const result = select({ resources: RESOURCES, options: { iam: true } })
      expect(result.inlineFunctionRole).toBe(false)
    })

    test('false when nothing is selected', () => {
      const result = select({ resources: RESOURCES, options: {} })
      expect(result.inlineFunctionRole).toBe(false)
    })
  })
})

describe('discover -> select: sandboxes MicrovmImage describable, NetworkConnector index-only', () => {
  // End-to-end through the REAL discoverResources (not a hand-built fixture):
  // a deployed MicrovmImage lands in the index under `sandboxes` AND is
  // expandable (GetMicrovmImage); a NetworkConnector lands in the index but
  // is never expanded (no describe op -- see registry/lambda-microvms.js and
  // select.js's Boolean(resource.awsService) expansion gate).
  async function discoverWithMicrovmResources() {
    const listStackResources = async () => ({
      StackResourceSummaries: [
        {
          LogicalResourceId: 'MyMicrovmImage',
          PhysicalResourceId: 'img-abc123',
          ResourceType: 'AWS::Lambda::MicrovmImage',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'MyNetworkConnector',
          PhysicalResourceId: 'nc-xyz789',
          ResourceType: 'AWS::Lambda::NetworkConnector',
          ResourceStatus: 'CREATE_COMPLETE',
        },
        {
          LogicalResourceId: 'CreateOrderLambdaFunction',
          PhysicalResourceId: 'orders-api-dev-createOrder',
          ResourceType: 'AWS::Lambda::Function',
          ResourceStatus: 'CREATE_COMPLETE',
        },
      ],
    })
    return discoverResources({
      listStackResources,
      stackName: 'orders-api-dev',
    })
  }

  test('both sandbox resources are in the index; MicrovmImage describable, NetworkConnector not', async () => {
    const resources = await discoverWithMicrovmResources()
    const image = resources.find((r) => r.logicalId === 'MyMicrovmImage')
    const connector = resources.find(
      (r) => r.logicalId === 'MyNetworkConnector',
    )
    expect(image.category).toBe('sandboxes')
    expect(image.awsService).toBe('lambda-microvms')
    expect(connector.category).toBe('sandboxes')
    expect(connector.awsService).toBeNull()
  })

  test('--sandboxes expands the MicrovmImage but not the NetworkConnector', async () => {
    const resources = await discoverWithMicrovmResources()
    const { selected } = select({ resources, options: { sandboxes: true } })
    expect(selected.find((r) => r.logicalId === 'MyMicrovmImage')).toBeDefined()
    expect(
      selected.find((r) => r.logicalId === 'MyNetworkConnector'),
    ).toBeUndefined()
  })

  test('--all expands the MicrovmImage (and the sibling function) but not the NetworkConnector', async () => {
    const resources = await discoverWithMicrovmResources()
    const { selected } = select({ resources, options: { all: true } })
    expect(selected.find((r) => r.logicalId === 'MyMicrovmImage')).toBeDefined()
    expect(
      selected.find((r) => r.logicalId === 'CreateOrderLambdaFunction'),
    ).toBeDefined()
    expect(
      selected.find((r) => r.logicalId === 'MyNetworkConnector'),
    ).toBeUndefined()
  })

  test('--aws-services lambda-microvms (and microvms/sandboxes aliases) select the MicrovmImage', async () => {
    const resources = await discoverWithMicrovmResources()
    for (const token of ['lambda-microvms', 'microvms', 'sandboxes']) {
      const { selected } = select({
        resources,
        options: { awsServices: token },
      })
      expect(
        selected.find((r) => r.logicalId === 'MyMicrovmImage'),
      ).toBeDefined()
      expect(
        selected.find((r) => r.logicalId === 'MyNetworkConnector'),
      ).toBeUndefined()
    }
  })
})
