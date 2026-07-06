import { describe, test, expect } from '@jest/globals'
import {
  REGISTRY_ENTRIES,
  AWS_SERVICE_ALIASES,
  resolveAwsServiceAlias,
  findByAwsService,
  findByCategory,
  findByCfnType,
} from '../../../../../lib/plugins/agent/lib/registry/index.js'

const EXPECTED_AWS_SERVICES = [
  'lambda',
  'iam',
  'apigateway',
  'apigatewayv2',
  'elbv2',
  'eventbridge',
  's3',
  'dynamodb',
  'sqs',
  'sns',
  'scheduler',
  'kinesis',
  'logs',
  'cloudwatch',
  'cognito-idp',
  'iot',
  'cloudfront',
]

// lambda-microvms is INDEX-ONLY (see registry/lambda-microvms.js): its two
// entries carry awsService:null/engineClient:null/calls:[] since there is no
// engine client for it yet (SDK not published at this repo's pin). They are
// deliberately excluded from the "every entry has the required fields"
// dispatchable-shape checks below and asserted on separately.
const INDEX_ONLY_CFN_TYPES = new Set([
  'AWS::Lambda::MicrovmImage',
  'AWS::Lambda::NetworkConnector',
])

function dispatchableEntries() {
  return REGISTRY_ENTRIES.filter(
    (entry) => !INDEX_ONLY_CFN_TYPES.has(entry.cfnType),
  )
}

describe('registry entry shape', () => {
  test('every entry has cfnType/category/identifier', () => {
    expect(REGISTRY_ENTRIES.length).toBeGreaterThan(0)
    for (const entry of REGISTRY_ENTRIES) {
      expect(typeof entry.cfnType).toBe('string')
      expect(entry.cfnType.startsWith('AWS::')).toBe(true)
      expect(typeof entry.category).toBe('string')
      expect(typeof entry.identifier).toBe('function')
      expect(Array.isArray(entry.calls)).toBe(true)
    }
  })

  test('every DISPATCHABLE entry has a string awsService/engineClient and at least one call', () => {
    for (const entry of dispatchableEntries()) {
      expect(typeof entry.awsService).toBe('string')
      expect(typeof entry.engineClient).toBe('string')
      expect(entry.calls.length).toBeGreaterThan(0)
    }
  })

  test('engineClient is recorded as a string name, never a class/object (dispatchable entries)', () => {
    for (const entry of dispatchableEntries()) {
      expect(typeof entry.engineClient).not.toBe('function')
      expect(typeof entry.engineClient).not.toBe('object')
    }
  })

  test('all dispatchable-service tokens are present', () => {
    const services = new Set(dispatchableEntries().map((e) => e.awsService))
    expect([...services].sort()).toEqual([...EXPECTED_AWS_SERVICES].sort())
  })

  test('cloudfront is wired as a full describe type (Task 8c)', () => {
    const services = new Set(REGISTRY_ENTRIES.map((entry) => entry.awsService))
    expect(services.has('cloudfront')).toBe(true)
  })

  test('each call declares key and method', () => {
    for (const entry of dispatchableEntries()) {
      for (const call of entry.calls) {
        expect(typeof call.key).toBe('string')
        expect(typeof call.method).toBe('string')
        // Command name, not the SDK v3 "...Command" class name.
        expect(call.method.endsWith('Command')).toBe(false)
      }
    }
  })

  test('a call has either params (function) or an explicit input key, not neither', () => {
    for (const entry of dispatchableEntries()) {
      for (const call of entry.calls) {
        const hasParams = typeof call.params === 'function'
        const hasInput = typeof call.input === 'string'
        // Some calls (e.g. LayerVersion's identifier already returns an
        // object matching the SDK input shape) legitimately have neither --
        // so this is just a sanity check that we never declare BOTH, which
        // would be ambiguous.
        expect(hasParams && hasInput).toBe(false)
      }
    }
  })
})

describe('lambda-microvms — index-only invariant', () => {
  test('MicrovmImage and NetworkConnector carry category sandboxes but no describe capability', () => {
    for (const cfnType of INDEX_ONLY_CFN_TYPES) {
      const entry = findByCfnType(cfnType)
      expect(entry).toBeDefined()
      expect(entry.category).toBe('sandboxes')
      expect(entry.awsService).toBeNull()
      expect(entry.calls).toEqual([])
    }
  })
})

describe('findByCfnType', () => {
  test('resolves a known cfnType to its entry', () => {
    const entry = findByCfnType('AWS::Lambda::Function')
    expect(entry).toBeDefined()
    expect(entry.awsService).toBe('lambda')
  })

  test('returns undefined for an unknown cfnType', () => {
    expect(findByCfnType('AWS::Made::Up')).toBeUndefined()
  })
})

describe('findByAwsService', () => {
  test('returns all entries for a canonical token', () => {
    const entries = findByAwsService('lambda')
    expect(entries.length).toBe(2) // Function + LayerVersion
    expect(entries.every((e) => e.awsService === 'lambda')).toBe(true)
  })

  test('resolves the events -> eventbridge alias', () => {
    const viaAlias = findByAwsService('events')
    const canonical = findByAwsService('eventbridge')
    expect(viaAlias).toEqual(canonical)
    expect(viaAlias.length).toBeGreaterThan(0)
  })

  test('resolves the alb -> elbv2 alias', () => {
    const viaAlias = findByAwsService('alb')
    const canonical = findByAwsService('elbv2')
    expect(viaAlias).toEqual(canonical)
    expect(viaAlias.length).toBeGreaterThan(0)
  })

  test('returns an empty array (not throw) for an unknown token', () => {
    expect(findByAwsService('not-a-real-service')).toEqual([])
  })

  test('resolves the cognito -> cognito-idp alias', () => {
    const viaAlias = findByAwsService('cognito')
    const canonical = findByAwsService('cognito-idp')
    expect(viaAlias).toEqual(canonical)
    expect(viaAlias.length).toBeGreaterThan(0)
  })

  test('microvms/sandboxes/lambda-microvms all resolve to the SAME (empty) result -- index-only entries have awsService:null, so findByAwsService (an exact awsService match) can never surface them', () => {
    // This is intentional, not a gap: lambda-microvms's entries are looked up
    // via findByCategory('sandboxes') for the index instead (see the
    // "lambda-microvms — index-only invariant" and findByCategory describe
    // blocks) -- findByAwsService is the axis used for describe EXPANSION,
    // which these entries must never participate in.
    const viaMicrovms = findByAwsService('microvms')
    const viaSandboxes = findByAwsService('sandboxes')
    const canonical = findByAwsService('lambda-microvms')
    expect(viaMicrovms).toEqual([])
    expect(viaSandboxes).toEqual([])
    expect(canonical).toEqual([])
  })

  test('alias map is a flat, one-line-per-alias structure', () => {
    expect(AWS_SERVICE_ALIASES).toEqual({
      events: 'eventbridge',
      alb: 'elbv2',
      cognito: 'cognito-idp',
      microvms: 'lambda-microvms',
      sandboxes: 'lambda-microvms',
    })
  })

  test('resolveAwsServiceAlias passes through unknown/canonical tokens unchanged', () => {
    expect(resolveAwsServiceAlias('lambda')).toBe('lambda')
    expect(resolveAwsServiceAlias('something-else')).toBe('something-else')
  })
})

describe('findByCategory', () => {
  test('groups entries by category', () => {
    const functionsEntries = findByCategory('functions')
    expect(functionsEntries.length).toBe(2)
    expect(functionsEntries.map((e) => e.cfnType).sort()).toEqual(
      ['AWS::Lambda::Function', 'AWS::Lambda::LayerVersion'].sort(),
    )
  })

  test('api category spans apigateway/apigatewayv2/elbv2', () => {
    const apiServices = new Set(findByCategory('api').map((e) => e.awsService))
    expect(apiServices).toEqual(
      new Set(['apigateway', 'apigatewayv2', 'elbv2']),
    )
  })

  test('events category spans eventbridge/sqs/sns/scheduler/kinesis', () => {
    const eventsServices = new Set(
      findByCategory('events').map((e) => e.awsService),
    )
    expect(eventsServices).toEqual(
      new Set(['eventbridge', 'sqs', 'sns', 'scheduler', 'kinesis']),
    )
  })

  test('storage category spans s3/dynamodb', () => {
    const storageServices = new Set(
      findByCategory('storage').map((e) => e.awsService),
    )
    expect(storageServices).toEqual(new Set(['s3', 'dynamodb']))
  })

  test('observability category spans logs/cloudwatch', () => {
    const observabilityServices = new Set(
      findByCategory('observability').map((e) => e.awsService),
    )
    expect(observabilityServices).toEqual(new Set(['logs', 'cloudwatch']))
  })

  test('identity category is cognito-idp only', () => {
    const identityServices = new Set(
      findByCategory('identity').map((e) => e.awsService),
    )
    expect(identityServices).toEqual(new Set(['cognito-idp']))
  })

  test('iot category is iot only (two cfnTypes)', () => {
    const iotEntries = findByCategory('iot')
    expect(iotEntries.length).toBe(2)
    expect(iotEntries.every((e) => e.awsService === 'iot')).toBe(true)
  })

  test('cdn category is cloudfront only (two cfnTypes)', () => {
    const cdnEntries = findByCategory('cdn')
    expect(cdnEntries.length).toBe(2)
    expect(cdnEntries.every((e) => e.awsService === 'cloudfront')).toBe(true)
  })

  test('sandboxes category is index-only (awsService null)', () => {
    const sandboxesEntries = findByCategory('sandboxes')
    expect(sandboxesEntries.length).toBe(2)
    expect(sandboxesEntries.every((e) => e.awsService === null)).toBe(true)
  })

  test('returns an empty array for an unknown category', () => {
    expect(findByCategory('not-a-category')).toEqual([])
  })
})

describe('identifier: Lambda::Function and simple pass-through types', () => {
  test('Lambda function identifier is the PhysicalResourceId as-is', () => {
    const entry = findByCfnType('AWS::Lambda::Function')
    expect(entry.identifier({ PhysicalResourceId: 'my-fn' })).toBe('my-fn')
  })

  test('IAM role identifier is the role name as-is', () => {
    const entry = findByCfnType('AWS::IAM::Role')
    expect(entry.identifier({ PhysicalResourceId: 'my-role' })).toBe('my-role')
  })

  test('REST API identifier is the restApiId as-is', () => {
    const entry = findByCfnType('AWS::ApiGateway::RestApi')
    expect(entry.identifier({ PhysicalResourceId: 'abc123' })).toBe('abc123')
  })

  test('HTTP/WebSocket API identifier is the ApiId as-is', () => {
    const entry = findByCfnType('AWS::ApiGatewayV2::Api')
    expect(entry.identifier({ PhysicalResourceId: 'xyz789' })).toBe('xyz789')
  })

  test('S3 bucket identifier is the bucket name as-is', () => {
    const entry = findByCfnType('AWS::S3::Bucket')
    expect(entry.identifier({ PhysicalResourceId: 'my-bucket' })).toBe(
      'my-bucket',
    )
  })

  test('DynamoDB table identifier is the table name as-is', () => {
    const entry = findByCfnType('AWS::DynamoDB::Table')
    expect(entry.identifier({ PhysicalResourceId: 'my-table' })).toBe(
      'my-table',
    )
  })

  test('SQS queue identifier is the queue URL as-is', () => {
    const entry = findByCfnType('AWS::SQS::Queue')
    const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
    expect(entry.identifier({ PhysicalResourceId: queueUrl })).toBe(queueUrl)
  })

  test('ELBv2 target group / listener rule identifiers are ARNs as-is', () => {
    const tgEntry = findByCfnType('AWS::ElasticLoadBalancingV2::TargetGroup')
    const tgArn =
      'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/abc'
    expect(tgEntry.identifier({ PhysicalResourceId: tgArn })).toBe(tgArn)

    const ruleEntry = findByCfnType('AWS::ElasticLoadBalancingV2::ListenerRule')
    const ruleArn =
      'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener-rule/app/my-alb/abc/def/ghi'
    expect(ruleEntry.identifier({ PhysicalResourceId: ruleArn })).toBe(ruleArn)
  })

  test('EventBridge EventBus identifier is the bus name as-is', () => {
    const entry = findByCfnType('AWS::Events::EventBus')
    expect(entry.identifier({ PhysicalResourceId: 'my-bus' })).toBe('my-bus')
  })
})

describe('identifier: Events::Rule pipe-split defensive handling', () => {
  const entry = () => findByCfnType('AWS::Events::Rule')

  test('plain rule name (default bus) -> { Name }', () => {
    expect(entry().identifier({ PhysicalResourceId: 'my-rule' })).toEqual({
      Name: 'my-rule',
    })
  })

  test('bus|rule id (custom bus, undocumented) -> { Name, EventBusName }', () => {
    expect(
      entry().identifier({ PhysicalResourceId: 'my-bus|my-rule' }),
    ).toEqual({ Name: 'my-rule', EventBusName: 'my-bus' })
  })
})

describe('identifier: Lambda::LayerVersion ARN parsing', () => {
  const entry = () => findByCfnType('AWS::Lambda::LayerVersion')

  test('parses a standard aws partition ARN', () => {
    const arn = 'arn:aws:lambda:us-east-1:123456789012:layer:my-layer:3'
    expect(entry().identifier({ PhysicalResourceId: arn })).toEqual({
      LayerName: 'my-layer',
      VersionNumber: 3,
    })
  })

  test('parses an aws-cn partition ARN', () => {
    const arn = 'arn:aws-cn:lambda:cn-north-1:123456789012:layer:my-layer:7'
    expect(entry().identifier({ PhysicalResourceId: arn })).toEqual({
      LayerName: 'my-layer',
      VersionNumber: 7,
    })
  })

  test('parses an aws-us-gov partition ARN', () => {
    const arn =
      'arn:aws-us-gov:lambda:us-gov-west-1:123456789012:layer:my-layer:12'
    expect(entry().identifier({ PhysicalResourceId: arn })).toEqual({
      LayerName: 'my-layer',
      VersionNumber: 12,
    })
  })

  test('VersionNumber is a number, not a string', () => {
    const arn = 'arn:aws:lambda:us-east-1:123456789012:layer:my-layer:3'
    const identifier = entry().identifier({ PhysicalResourceId: arn })
    expect(identifier.VersionNumber).toBe(3)
    expect(typeof identifier.VersionNumber).toBe('number')
  })
})

describe('REST API GetResources call', () => {
  test('carries embed=["methods"] and paginate', () => {
    const entry = findByCfnType('AWS::ApiGateway::RestApi')
    const call = entry.calls.find((c) => c.method === 'GetResources')
    expect(call).toBeDefined()
    expect(call.paginate).toBe(true)
    expect(typeof call.params).toBe('function')
    expect(call.params('abc123')).toEqual({
      restApiId: 'abc123',
      embed: ['methods'],
    })
  })

  test('never issues a per-method GetMethod fan-out', () => {
    const entry = findByCfnType('AWS::ApiGateway::RestApi')
    const methods = entry.calls.map((c) => c.method)
    expect(methods).not.toContain('GetMethod')
  })
})

describe('Lambda function optional calls', () => {
  const entry = () => findByCfnType('AWS::Lambda::Function')

  test('includes GetFunctionEventInvokeConfig as optional', () => {
    const call = entry().calls.find(
      (c) => c.method === 'GetFunctionEventInvokeConfig',
    )
    expect(call).toBeDefined()
    expect(call.optional).toBe(true)
  })

  test('GetFunctionUrlConfig and GetPolicy are optional', () => {
    const urlCall = entry().calls.find(
      (c) => c.method === 'GetFunctionUrlConfig',
    )
    const policyCall = entry().calls.find((c) => c.method === 'GetPolicy')
    expect(urlCall.optional).toBe(true)
    expect(policyCall.optional).toBe(true)
  })

  test('list calls are paginated', () => {
    const listMethods = [
      'ListVersionsByFunction',
      'ListAliases',
      'ListEventSourceMappings',
    ]
    for (const method of listMethods) {
      const call = entry().calls.find((c) => c.method === method)
      expect(call.paginate).toBe(true)
    }
  })

  test('GetFunction is required (not optional)', () => {
    const call = entry().calls.find((c) => c.method === 'GetFunction')
    expect(call.optional).toBeFalsy()
  })
})

describe('ApiGatewayV2: no GetApiMappings', () => {
  test('GetApiMappings is absent from the registry entry', () => {
    const entry = findByCfnType('AWS::ApiGatewayV2::Api')
    const methods = entry.calls.map((c) => c.method)
    expect(methods).not.toContain('GetApiMappings')
  })
})

describe('EventBridge targets call remaps identifier for ListTargetsByRule', () => {
  test('uses Rule (not Name) and forwards EventBusName when present', () => {
    const entry = findByCfnType('AWS::Events::Rule')
    const call = entry.calls.find((c) => c.method === 'ListTargetsByRule')
    expect(call.paginate).toBe(true)
    expect(call.params({ Name: 'my-rule' })).toEqual({ Rule: 'my-rule' })
    expect(call.params({ Name: 'my-rule', EventBusName: 'my-bus' })).toEqual({
      Rule: 'my-rule',
      EventBusName: 'my-bus',
    })
  })
})

describe('ELBv2 calls wrap the ARN identifier into list-shaped params', () => {
  test('DescribeTargetGroups wraps identifier into TargetGroupArns', () => {
    const entry = findByCfnType('AWS::ElasticLoadBalancingV2::TargetGroup')
    const call = entry.calls.find((c) => c.method === 'DescribeTargetGroups')
    expect(call.params('arn:aws:...:targetgroup/x')).toEqual({
      TargetGroupArns: ['arn:aws:...:targetgroup/x'],
    })
  })

  test('DescribeRules wraps identifier into RuleArns', () => {
    const entry = findByCfnType('AWS::ElasticLoadBalancingV2::ListenerRule')
    const call = entry.calls.find((c) => c.method === 'DescribeRules')
    expect(call.params('arn:aws:...:listener-rule/x')).toEqual({
      RuleArns: ['arn:aws:...:listener-rule/x'],
    })
  })
})

describe('SQS GetQueueAttributes call', () => {
  test('passes the queue URL identifier as QueueUrl with AttributeNames: [All]', () => {
    const entry = findByCfnType('AWS::SQS::Queue')
    const call = entry.calls.find((c) => c.method === 'GetQueueAttributes')
    const url = 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
    expect(call.params(url)).toEqual({
      QueueUrl: url,
      AttributeNames: ['All'],
    })
  })
})

describe('IAM inline/attached policy fan-out declarations', () => {
  test('ListRolePolicies declares a fan-out to GetRolePolicy', () => {
    const entry = findByCfnType('AWS::IAM::Role')
    const call = entry.calls.find((c) => c.method === 'ListRolePolicies')
    expect(call.paginate).toBe(true)
    expect(call.fanOut).toBeDefined()
    expect(call.fanOut.method).toBe('GetRolePolicy')
  })

  test('ListAttachedRolePolicies declares a fan-out to GetPolicy', () => {
    const entry = findByCfnType('AWS::IAM::Role')
    const call = entry.calls.find(
      (c) => c.method === 'ListAttachedRolePolicies',
    )
    expect(call.paginate).toBe(true)
    expect(call.fanOut).toBeDefined()
    expect(call.fanOut.method).toBe('GetPolicy')
  })

  test('the attached-policy fan-out chains a second-level GetPolicyVersion step to reach the document', () => {
    // Two-hop chain per spec: ListAttachedRolePolicies -> AttachedPolicies[].PolicyArn
    // -> GetPolicy{PolicyArn} -> Policy.DefaultVersionId -> GetPolicyVersion{PolicyArn,
    // VersionId} -> PolicyVersion.Document. A bare GetPolicy fan-out (Finding 1) can
    // never reach the actual policy document -- assert the chained step is declared.
    const entry = findByCfnType('AWS::IAM::Role')
    const call = entry.calls.find(
      (c) => c.method === 'ListAttachedRolePolicies',
    )
    const chain = call.fanOut.then
    expect(chain).toBeDefined()
    expect(chain.method).toBe('GetPolicyVersion')

    // PolicyArn is carried over from the same item that fed GetPolicy.
    expect(chain.itemInput).toBe('PolicyArn')

    // VersionId is drawn from the prior GetPolicy result, not the list item.
    expect(chain.fromResult).toEqual({
      input: 'VersionId',
      resultField: 'Policy.DefaultVersionId',
    })
  })
})

describe('API Gateway account-wide calls (GetUsagePlans/GetApiKeys)', () => {
  test('do not bind the restApiId identifier under an input key', () => {
    const entry = findByCfnType('AWS::ApiGateway::RestApi')
    const usagePlansCall = entry.calls.find((c) => c.method === 'GetUsagePlans')
    const apiKeysCall = entry.calls.find((c) => c.method === 'GetApiKeys')
    expect(usagePlansCall.input).toBeUndefined()
    expect(apiKeysCall.input).toBeUndefined()
    expect(usagePlansCall.params()).toEqual({})
    expect(apiKeysCall.params()).toEqual({})
    expect(usagePlansCall.paginate).toBe(true)
    expect(apiKeysCall.paginate).toBe(true)
  })
})

describe('SNS::Topic', () => {
  const entry = () => findByCfnType('AWS::SNS::Topic')

  test('identifier is the topic ARN as-is', () => {
    const arn = 'arn:aws:sns:us-east-1:123456789012:orders-api-dev-OrderEvents'
    expect(entry().identifier({ PhysicalResourceId: arn })).toBe(arn)
  })

  test('GetTopicAttributes takes TopicArn', () => {
    const call = entry().calls.find((c) => c.method === 'GetTopicAttributes')
    expect(call.input).toBe('TopicArn')
    expect(call.optional).toBeFalsy()
  })

  test('ListSubscriptionsByTopic takes TopicArn and paginates', () => {
    const call = entry().calls.find(
      (c) => c.method === 'ListSubscriptionsByTopic',
    )
    expect(call.input).toBe('TopicArn')
    expect(call.paginate).toBe(true)
  })

  test('ListTagsForResource is optional and remaps TopicArn -> ResourceArn', () => {
    const call = entry().calls.find((c) => c.method === 'ListTagsForResource')
    expect(call.optional).toBe(true)
    expect(typeof call.params).toBe('function')
    const arn = 'arn:aws:sns:us-east-1:123456789012:my-topic'
    expect(call.params(arn)).toEqual({ ResourceArn: arn })
  })
})

describe('Scheduler::Schedule', () => {
  const entry = () => findByCfnType('AWS::Scheduler::Schedule')

  test('identifier is the schedule Name as-is (CFN Ref returns Name)', () => {
    expect(
      entry().identifier({ PhysicalResourceId: 'orders-api-dev-reconcile' }),
    ).toBe('orders-api-dev-reconcile')
  })

  test('GetSchedule takes Name', () => {
    const call = entry().calls.find((c) => c.method === 'GetSchedule')
    expect(call.input).toBe('Name')
  })
})

describe('Kinesis::StreamConsumer', () => {
  const entry = () => findByCfnType('AWS::Kinesis::StreamConsumer')

  test('identifier is the consumer ARN as-is', () => {
    const arn = 'arn:aws:kinesis:us-east-1:123456789012:stream/s/consumer/c:1'
    expect(entry().identifier({ PhysicalResourceId: arn })).toBe(arn)
  })

  test('DescribeStreamConsumer takes ConsumerARN', () => {
    const call = entry().calls.find(
      (c) => c.method === 'DescribeStreamConsumer',
    )
    expect(call.input).toBe('ConsumerARN')
  })
})

describe('Logs::LogGroup', () => {
  const entry = () => findByCfnType('AWS::Logs::LogGroup')

  test('identifier is the log group name as-is', () => {
    const name = '/aws/lambda/orders-api-dev-createOrder'
    expect(entry().identifier({ PhysicalResourceId: name })).toBe(name)
  })

  test('DescribeLogGroups uses logGroupNamePrefix (documented best-effort limitation)', () => {
    const call = entry().calls.find((c) => c.method === 'DescribeLogGroups')
    expect(typeof call.params).toBe('function')
    expect(call.params('/aws/lambda/foo')).toEqual({
      logGroupNamePrefix: '/aws/lambda/foo',
    })
  })

  test('DescribeSubscriptionFilters/DescribeMetricFilters take logGroupName and paginate', () => {
    for (const method of [
      'DescribeSubscriptionFilters',
      'DescribeMetricFilters',
    ]) {
      const call = entry().calls.find((c) => c.method === method)
      expect(call.input).toBe('logGroupName')
      expect(call.paginate).toBe(true)
    }
  })

  test('ListTagsLogGroup is optional and takes logGroupName', () => {
    const call = entry().calls.find((c) => c.method === 'ListTagsLogGroup')
    expect(call.input).toBe('logGroupName')
    expect(call.optional).toBe(true)
  })
})

describe('CloudWatch::Alarm and CloudWatch::Dashboard (two cfnTypes, one awsService)', () => {
  test('both entries carry awsService cloudwatch', () => {
    const alarm = findByCfnType('AWS::CloudWatch::Alarm')
    const dashboard = findByCfnType('AWS::CloudWatch::Dashboard')
    expect(alarm.awsService).toBe('cloudwatch')
    expect(dashboard.awsService).toBe('cloudwatch')
  })

  test('Alarm identifier is the alarm name; DescribeAlarms wraps it into AlarmNames', () => {
    const entry = findByCfnType('AWS::CloudWatch::Alarm')
    expect(
      entry.identifier({ PhysicalResourceId: 'orders-api-dev-errors' }),
    ).toBe('orders-api-dev-errors')
    const call = entry.calls.find((c) => c.method === 'DescribeAlarms')
    expect(typeof call.params).toBe('function')
    expect(call.params('orders-api-dev-errors')).toEqual({
      AlarmNames: ['orders-api-dev-errors'],
    })
  })

  test('Dashboard identifier is the dashboard name; GetDashboard takes DashboardName', () => {
    const entry = findByCfnType('AWS::CloudWatch::Dashboard')
    expect(entry.identifier({ PhysicalResourceId: 'my-dashboard' })).toBe(
      'my-dashboard',
    )
    const call = entry.calls.find((c) => c.method === 'GetDashboard')
    expect(call.input).toBe('DashboardName')
  })
})

describe('Cognito::UserPool', () => {
  const entry = () => findByCfnType('AWS::Cognito::UserPool')

  test('awsService is cognito-idp; category is identity', () => {
    expect(entry().awsService).toBe('cognito-idp')
    expect(entry().category).toBe('identity')
  })

  test('identifier is the user pool id as-is', () => {
    expect(entry().identifier({ PhysicalResourceId: 'us-east-1_abc123' })).toBe(
      'us-east-1_abc123',
    )
  })

  test('DescribeUserPool takes UserPoolId', () => {
    const call = entry().calls.find((c) => c.method === 'DescribeUserPool')
    expect(call.input).toBe('UserPoolId')
  })

  test('ListUserPoolClients takes UserPoolId, paginates, and fans out to DescribeUserPoolClient', () => {
    const call = entry().calls.find((c) => c.method === 'ListUserPoolClients')
    expect(call.input).toBe('UserPoolId')
    expect(call.paginate).toBe(true)
    expect(call.fanOut).toBeDefined()
    expect(call.fanOut.method).toBe('DescribeUserPoolClient')
    expect(call.fanOut.listResultKey).toBe('UserPoolClients')
    expect(call.fanOut.itemInput).toBe('ClientId')
    expect(call.fanOut.itemField).toBe('ClientId')
  })

  test('the fan-out extraInput supplies the outer UserPoolId alongside the per-item ClientId', () => {
    // This is the extension run-calls.js's runFanOut needed: itemField alone
    // only reuses the outer `input` when itemField is ABSENT (see IAM's
    // single-hop inline-policy fan-out) -- Cognito needs BOTH itemField
    // (ClientId) and an outer constant (UserPoolId) on the same call.
    const call = entry().calls.find((c) => c.method === 'ListUserPoolClients')
    expect(typeof call.fanOut.extraInput).toBe('function')
    expect(call.fanOut.extraInput('us-east-1_abc123')).toEqual({
      UserPoolId: 'us-east-1_abc123',
    })
  })
})

describe('IoT::TopicRule and IoT::ProvisioningTemplate', () => {
  test('TopicRule identifier is the rule name; GetTopicRule takes ruleName', () => {
    const entry = findByCfnType('AWS::IoT::TopicRule')
    expect(entry.awsService).toBe('iot')
    expect(entry.category).toBe('iot')
    expect(entry.identifier({ PhysicalResourceId: 'my-rule' })).toBe('my-rule')
    const call = entry.calls.find((c) => c.method === 'GetTopicRule')
    expect(call.input).toBe('ruleName')
  })

  test('ProvisioningTemplate identifier is the template name; DescribeProvisioningTemplate takes templateName', () => {
    const entry = findByCfnType('AWS::IoT::ProvisioningTemplate')
    expect(entry.awsService).toBe('iot')
    expect(entry.category).toBe('iot')
    expect(entry.identifier({ PhysicalResourceId: 'my-template' })).toBe(
      'my-template',
    )
    const call = entry.calls.find(
      (c) => c.method === 'DescribeProvisioningTemplate',
    )
    expect(call.input).toBe('templateName')
  })
})

describe('CloudFront::Distribution and CloudFront::CachePolicy (global service)', () => {
  test('Distribution identifier is the distribution id as-is; GetDistribution takes Id', () => {
    const entry = findByCfnType('AWS::CloudFront::Distribution')
    expect(entry.awsService).toBe('cloudfront')
    expect(entry.category).toBe('cdn')
    expect(entry.engineClient).toBe('cloudfront')
    expect(entry.identifier({ PhysicalResourceId: 'E1234567890ABC' })).toBe(
      'E1234567890ABC',
    )
    const call = entry.calls.find((c) => c.method === 'GetDistribution')
    expect(call.input).toBe('Id')
  })

  test('CachePolicy identifier is the cache policy id as-is; GetCachePolicy takes Id', () => {
    const entry = findByCfnType('AWS::CloudFront::CachePolicy')
    expect(entry.awsService).toBe('cloudfront')
    expect(entry.category).toBe('cdn')
    expect(entry.engineClient).toBe('cloudfront')
    const policyId = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
    expect(entry.identifier({ PhysicalResourceId: policyId })).toBe(policyId)
    const call = entry.calls.find((c) => c.method === 'GetCachePolicy')
    expect(call.input).toBe('Id')
  })
})
