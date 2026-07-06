import { describe, test, expect } from '@jest/globals'
import {
  discoverResources,
  groupByCategory,
} from '../../../../../lib/plugins/agent/lib/discover-resources.js'
import { select } from '../../../../../lib/plugins/agent/lib/select.js'
import { REGISTRY_ENTRIES } from '../../../../../lib/plugins/agent/lib/registry/index.js'
import ServerlessError from '../../../../../lib/serverless-error.js'

// Builds a mock `listStackResources(stackName, nextToken?)` backed by a plain
// { [stackName]: [page, page, ...] } map. Each page is an object with
// StackResourceSummaries (+ optional NextToken); the mock returns the page
// keyed by the incoming nextToken (undefined => first page). Records every
// (stackName, nextToken) call for pagination/recursion assertions.
function mockLister(stacks) {
  const calls = []
  const lister = async (stackName, nextToken) => {
    calls.push({ stackName, nextToken })
    const pages = stacks[stackName]
    if (!pages) throw new Error(`unexpected stack lookup: ${stackName}`)
    // First call has no nextToken; subsequent calls carry the token the prior
    // page returned, which we treat as a 1-based page index.
    const pageIndex = nextToken == null ? 0 : nextToken
    return pages[pageIndex]
  }
  lister.calls = calls
  return lister
}

function summary(logicalId, type, physicalId, status = 'CREATE_COMPLETE') {
  return {
    LogicalResourceId: logicalId,
    ResourceType: type,
    PhysicalResourceId: physicalId,
    ResourceStatus: status,
  }
}

describe('discoverResources', () => {
  test('registry-driven category/awsService: primary types get real values, sub-resources and unsupported types get other/null', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary(
              'CreateOrderLambdaFunction',
              'AWS::Lambda::Function',
              'orders-api-dev-createOrder',
              'UPDATE_COMPLETE',
            ),
            // Folded sub-resource of the function -> other/null.
            summary(
              'CreateOrderLambdaPermission',
              'AWS::Lambda::Permission',
              'orders-api-dev-createOrder-perm',
            ),
            summary('OrdersRole', 'AWS::IAM::Role', 'orders-api-dev-role'),
            // Genuinely unsupported -> other/null.
            summary(
              'ApiGatewayWafAssociation',
              'AWS::WAFv2::WebACLAssociation',
              'assoc-123',
            ),
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    expect(resources).toEqual([
      {
        logicalId: 'CreateOrderLambdaFunction',
        physicalId: 'orders-api-dev-createOrder',
        type: 'AWS::Lambda::Function',
        status: 'UPDATE_COMPLETE',
        category: 'functions',
        awsService: 'lambda',
        stack: 'orders-api-dev',
      },
      {
        logicalId: 'CreateOrderLambdaPermission',
        physicalId: 'orders-api-dev-createOrder-perm',
        type: 'AWS::Lambda::Permission',
        status: 'CREATE_COMPLETE',
        category: 'other',
        awsService: null,
        stack: 'orders-api-dev',
      },
      {
        logicalId: 'OrdersRole',
        physicalId: 'orders-api-dev-role',
        type: 'AWS::IAM::Role',
        status: 'CREATE_COMPLETE',
        category: 'iam',
        awsService: 'iam',
        stack: 'orders-api-dev',
      },
      {
        logicalId: 'ApiGatewayWafAssociation',
        physicalId: 'assoc-123',
        type: 'AWS::WAFv2::WebACLAssociation',
        status: 'CREATE_COMPLETE',
        category: 'other',
        awsService: null,
        stack: 'orders-api-dev',
      },
    ])
  })

  test('pagination: follows NextToken until exhausted and concatenates all summaries', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [summary('A', 'AWS::Lambda::Function', 'a')],
          NextToken: 1,
        },
        {
          StackResourceSummaries: [summary('B', 'AWS::Lambda::Function', 'b')],
          NextToken: 2,
        },
        {
          StackResourceSummaries: [summary('C', 'AWS::S3::Bucket', 'c')],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    expect(resources.map((r) => r.logicalId)).toEqual(['A', 'B', 'C'])
    // Three pages => three calls, tokens threaded through.
    expect(lister.calls).toEqual([
      { stackName: 'orders-api-dev', nextToken: undefined },
      { stackName: 'orders-api-dev', nextToken: 1 },
      { stackName: 'orders-api-dev', nextToken: 2 },
    ])
  })

  test('nested-stack recursion: folds child resources in with stack tagging and does not emit the wrapper', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary('RootFn', 'AWS::Lambda::Function', 'root-fn'),
            summary(
              'NestedStackOne',
              'AWS::CloudFormation::Stack',
              'arn:aws:cloudformation:us-east-1:123456789012:stack/orders-api-dev-NestedStackOne/abc123',
            ),
          ],
        },
      ],
      'orders-api-dev-NestedStackOne': [
        {
          StackResourceSummaries: [
            summary('ChildFn', 'AWS::Lambda::Function', 'child-fn'),
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    // Wrapper not emitted; child folded in.
    expect(resources.map((r) => r.type)).not.toContain(
      'AWS::CloudFormation::Stack',
    )
    expect(resources).toEqual([
      expect.objectContaining({
        logicalId: 'RootFn',
        stack: 'orders-api-dev',
      }),
      expect.objectContaining({
        logicalId: 'ChildFn',
        stack: 'orders-api-dev-NestedStackOne',
      }),
    ])
  })

  test('nested-stack cycle guard: a self/mutually-referential child stack is enumerated only once', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary('RootFn', 'AWS::Lambda::Function', 'root-fn'),
            summary(
              'NestedStackOne',
              'AWS::CloudFormation::Stack',
              'arn:aws:cloudformation:us-east-1:123456789012:stack/orders-api-dev-NestedStackOne/abc123',
            ),
          ],
        },
      ],
      'orders-api-dev-NestedStackOne': [
        {
          StackResourceSummaries: [
            summary('ChildFn', 'AWS::Lambda::Function', 'child-fn'),
            // Points back at the root stack -> cycle.
            summary(
              'BackRef',
              'AWS::CloudFormation::Stack',
              'arn:aws:cloudformation:us-east-1:123456789012:stack/orders-api-dev/root123',
            ),
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    // Terminates; each stack enumerated exactly once.
    expect(
      lister.calls.filter((c) => c.stackName === 'orders-api-dev'),
    ).toHaveLength(1)
    expect(
      lister.calls.filter(
        (c) => c.stackName === 'orders-api-dev-NestedStackOne',
      ),
    ).toHaveLength(1)
    expect(resources.map((r) => r.logicalId)).toEqual(['RootFn', 'ChildFn'])
  })

  test('empty/absent PhysicalResourceId is still emitted with physicalId "" and its status', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary('FailedFn', 'AWS::Lambda::Function', '', 'CREATE_FAILED'),
            {
              LogicalResourceId: 'NoPhysical',
              ResourceType: 'AWS::S3::Bucket',
              ResourceStatus: 'CREATE_IN_PROGRESS',
              // PhysicalResourceId absent entirely.
            },
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    expect(resources).toEqual([
      expect.objectContaining({
        logicalId: 'FailedFn',
        physicalId: '',
        status: 'CREATE_FAILED',
      }),
      expect.objectContaining({
        logicalId: 'NoPhysical',
        physicalId: '',
        status: 'CREATE_IN_PROGRESS',
      }),
    ])
  })
})

describe('groupByCategory', () => {
  test('returns every known registry category plus other, each an array, sorted by logicalId within', () => {
    const descriptors = [
      {
        logicalId: 'ZFn',
        physicalId: 'z',
        type: 'AWS::Lambda::Function',
        status: 'CREATE_COMPLETE',
        category: 'functions',
        awsService: 'lambda',
        stack: 'orders-api-dev',
      },
      {
        logicalId: 'AFn',
        physicalId: 'a',
        type: 'AWS::Lambda::Function',
        status: 'CREATE_COMPLETE',
        category: 'functions',
        awsService: 'lambda',
        stack: 'orders-api-dev',
      },
      {
        logicalId: 'Waf',
        physicalId: 'w',
        type: 'AWS::WAFv2::WebACLAssociation',
        status: 'CREATE_COMPLETE',
        category: 'other',
        awsService: null,
        stack: 'orders-api-dev',
      },
    ]

    const grouped = groupByCategory(descriptors)

    // Every registry category plus `other` present as an array.
    const expectedCategories = [
      ...new Set(REGISTRY_ENTRIES.map((e) => e.category)),
      'other',
    ]
    expect(Object.keys(grouped)).toEqual(expectedCategories)
    for (const category of expectedCategories) {
      expect(Array.isArray(grouped[category])).toBe(true)
    }

    // Sorted by logicalId within a category.
    expect(grouped.functions.map((r) => r.logicalId)).toEqual(['AFn', 'ZFn'])
    expect(grouped.other.map((r) => r.logicalId)).toEqual(['Waf'])
    // `other` is always last.
    expect(Object.keys(grouped)[Object.keys(grouped).length - 1]).toBe('other')
  })

  test('empty input still yields every category as an empty array (stable shape)', () => {
    const grouped = groupByCategory([])
    const expectedCategories = [
      ...new Set(REGISTRY_ENTRIES.map((e) => e.category)),
      'other',
    ]
    expect(Object.keys(grouped)).toEqual(expectedCategories)
    for (const category of expectedCategories) {
      expect(grouped[category]).toEqual([])
    }
  })
})

describe('discover -> select integration', () => {
  test('--functions on a stack with a Lambda function + its Permission expands ONLY the function', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary(
              'CreateOrderLambdaFunction',
              'AWS::Lambda::Function',
              'orders-api-dev-createOrder',
            ),
            summary(
              'CreateOrderLambdaPermissionApi',
              'AWS::Lambda::Permission',
              'orders-api-dev-createOrder-perm',
            ),
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    const { selected } = select({
      resources,
      options: { functions: true },
    })

    expect(selected.map((r) => r.logicalId)).toEqual([
      'CreateOrderLambdaFunction',
    ])
  })

  test('a CloudFront Distribution is categorized cdn (not other), and both --cdn and --aws-services cloudfront expand it', async () => {
    const lister = mockLister({
      'orders-api-dev': [
        {
          StackResourceSummaries: [
            summary(
              'SiteDistribution',
              'AWS::CloudFront::Distribution',
              'E1234567890ABC',
            ),
            summary(
              'CreateOrderLambdaFunction',
              'AWS::Lambda::Function',
              'orders-api-dev-createOrder',
            ),
          ],
        },
      ],
    })

    const resources = await discoverResources({
      listStackResources: lister,
      stackName: 'orders-api-dev',
    })

    const distribution = resources.find(
      (r) => r.logicalId === 'SiteDistribution',
    )
    expect(distribution.category).toBe('cdn')
    expect(distribution.awsService).toBe('cloudfront')

    const viaCategory = select({ resources, options: { cdn: true } })
    expect(viaCategory.selected.map((r) => r.logicalId)).toEqual([
      'SiteDistribution',
    ])

    const viaAwsServices = select({
      resources,
      options: { awsServices: 'cloudfront' },
    })
    expect(viaAwsServices.selected.map((r) => r.logicalId)).toEqual([
      'SiteDistribution',
    ])
  })
})
