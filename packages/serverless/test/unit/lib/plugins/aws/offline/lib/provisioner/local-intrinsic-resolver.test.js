import {
  resolveIntrinsics,
  UNRESOLVED,
} from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/local-intrinsic-resolver.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const QUEUE_RECORD = {
  logicalId: 'MyQueue',
  url: 'http://localhost:3002/000000000000/MyQueue',
  arn: 'arn:aws:sqs:us-east-1:000000000000:MyQueue',
  name: 'MyQueue',
  properties: {},
}

const TOPIC_RECORD = {
  logicalId: 'MyTopic',
  arn: 'arn:aws:sns:us-east-1:000000000000:MyTopic',
  name: 'MyTopic',
  properties: {},
}

const BUCKET_RECORD = {
  logicalId: 'MyBucket',
  name: 'my-bucket',
  arn: 'arn:aws:s3:::my-bucket',
  properties: {},
}

const EVENT_BUS_RECORD = {
  logicalId: 'MyBus',
  name: 'my-bus',
  arn: 'arn:aws:events:us-east-1:000000000000:event-bus/my-bus',
  kind: 'bus',
  properties: {},
}

const LAMBDA_RECORD = {
  logicalId: 'MyLambda',
  functionKey: 'myFunc',
  name: 'my-service-dev-myFunc',
  arn: 'arn:aws:lambda:us-east-1:000000000000:function:my-service-dev-myFunc',
}

function makeRegistry({
  sqs = [],
  sns = [],
  s3 = [],
  events = [],
  lambda = [],
} = {}) {
  return {
    sqs: new Map(sqs),
    sns: new Map(sns),
    s3: new Map(s3),
    events: new Map(events),
    lambda: new Map(lambda),
  }
}

const BASE_PSEUDO = {
  'AWS::AccountId': '000000000000',
  'AWS::Region': 'us-east-1',
  'AWS::Partition': 'aws',
  'AWS::URLSuffix': 'amazonaws.com',
  'AWS::StackName': 'my-service-dev',
  'AWS::StackId':
    'arn:aws:cloudformation:us-east-1:000000000000:stack/my-service-dev/0',
  'AWS::NotificationARNs': [],
  'AWS::NoValue': Symbol.for('AWS::NoValue'),
}

function makeContext({
  registry,
  pseudoParams,
  parameters,
  conditions,
  mappings,
  warnings,
} = {}) {
  return {
    registry: registry ?? makeRegistry(),
    parameters: parameters ?? {},
    pseudoParams: pseudoParams ?? BASE_PSEUDO,
    conditions: conditions ?? new Map(),
    mappings: mappings ?? {},
    warnings: warnings ?? [],
  }
}

// ---------------------------------------------------------------------------
// 1. Primitives pass through unchanged
// ---------------------------------------------------------------------------

describe('primitives', () => {
  it('1. passes through numbers unchanged', () => {
    expect(resolveIntrinsics(42, makeContext())).toBe(42)
  })

  it('1. passes through booleans unchanged', () => {
    expect(resolveIntrinsics(true, makeContext())).toBe(true)
  })

  it('1. passes through null unchanged', () => {
    expect(resolveIntrinsics(null, makeContext())).toBeNull()
  })

  it('1. passes through undefined unchanged', () => {
    expect(resolveIntrinsics(undefined, makeContext())).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Bare string 'AWS::Region' is NOT auto-substituted
// ---------------------------------------------------------------------------

it('2. bare string "AWS::Region" is returned as-is', () => {
  expect(resolveIntrinsics('AWS::Region', makeContext())).toBe('AWS::Region')
})

// ---------------------------------------------------------------------------
// 3-7. Pseudo-params via { Ref }
// ---------------------------------------------------------------------------

it('3. { Ref: "AWS::Region" } → "us-east-1"', () => {
  expect(resolveIntrinsics({ Ref: 'AWS::Region' }, makeContext())).toBe(
    'us-east-1',
  )
})

it('4. { Ref: "AWS::AccountId" } → "000000000000"', () => {
  expect(resolveIntrinsics({ Ref: 'AWS::AccountId' }, makeContext())).toBe(
    '000000000000',
  )
})

it('5. { Ref: "AWS::Partition" } → "aws"', () => {
  expect(resolveIntrinsics({ Ref: 'AWS::Partition' }, makeContext())).toBe(
    'aws',
  )
})

it('6. { Ref: "AWS::URLSuffix" } → "amazonaws.com"', () => {
  expect(resolveIntrinsics({ Ref: 'AWS::URLSuffix' }, makeContext())).toBe(
    'amazonaws.com',
  )
})

it('7. { Ref: "AWS::StackName" } → context pseudoParam value', () => {
  expect(resolveIntrinsics({ Ref: 'AWS::StackName' }, makeContext())).toBe(
    'my-service-dev',
  )
})

// ---------------------------------------------------------------------------
// 8. { Ref: 'MyQueue' } → queue URL
// ---------------------------------------------------------------------------

it('8. { Ref: "MyQueue" } against a registry with the queue → queue URL', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyQueue' }, ctx)).toBe(QUEUE_RECORD.url)
})

// ---------------------------------------------------------------------------
// 9. { Ref: 'MyTopic' } → topic ARN
// ---------------------------------------------------------------------------

it('9. { Ref: "MyTopic" } against a registry with the topic → topic ARN', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sns: [['MyTopic', TOPIC_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyTopic' }, ctx)).toBe(TOPIC_RECORD.arn)
})

// ---------------------------------------------------------------------------
// 9b-9f. Ref for the remaining provisioned resource types and parameters
// ---------------------------------------------------------------------------

it('9b. { Ref: "MyBucket" } → bucket name', () => {
  const ctx = makeContext({
    registry: makeRegistry({ s3: [['MyBucket', BUCKET_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyBucket' }, ctx)).toBe(BUCKET_RECORD.name)
})

it('9c. { Ref: "MyBus" } → event resource name', () => {
  const ctx = makeContext({
    registry: makeRegistry({ events: [['MyBus', EVENT_BUS_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyBus' }, ctx)).toBe(EVENT_BUS_RECORD.name)
})

it('9d. { Ref: "MyLambda" } → lambda ARN', () => {
  const ctx = makeContext({
    registry: makeRegistry({ lambda: [['MyLambda', LAMBDA_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyLambda' }, ctx)).toBe(LAMBDA_RECORD.arn)
})

it('9e. { Ref: "MyParam" } → CloudFormation parameter value', () => {
  const ctx = makeContext({ parameters: { MyParam: 'param-value' } })
  expect(resolveIntrinsics({ Ref: 'MyParam' }, ctx)).toBe('param-value')
})

// ---------------------------------------------------------------------------
// 10. { Ref: 'Unknown' } → UNRESOLVED + warning (boot must not crash)
// ---------------------------------------------------------------------------

it('10. { Ref: "Unknown" } against an empty registry → UNRESOLVED + warning', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(resolveIntrinsics({ Ref: 'Unknown' }, ctx)).toBe(UNRESOLVED)
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_UNRESOLVED_REFERENCE',
      reference: 'Unknown',
      detail: expect.any(String),
    },
  ])
})

it('10b. an UNRESOLVED Ref as an object value drops the key', () => {
  const ctx = makeContext()
  expect(
    resolveIntrinsics({ keep: 'yes', drop: { Ref: 'Unknown' } }, ctx),
  ).toEqual({ keep: 'yes' })
})

it('10c. duplicate unresolvable Refs warn only once', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  resolveIntrinsics({ a: { Ref: 'Unknown' }, b: { Ref: 'Unknown' } }, ctx)
  expect(warnings).toHaveLength(1)
})

// ---------------------------------------------------------------------------
// 11-16. Fn::GetAtt
// ---------------------------------------------------------------------------

it('11. Fn::GetAtt ["MyQueue", "Arn"] → queue ARN', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', 'Arn'] }, ctx)).toBe(
    QUEUE_RECORD.arn,
  )
})

it('12. Fn::GetAtt ["MyQueue", "QueueName"] → queue name', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', 'QueueName'] }, ctx),
  ).toBe(QUEUE_RECORD.name)
})

it('13. Fn::GetAtt ["MyQueue", "QueueUrl"] → queue URL', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', 'QueueUrl'] }, ctx),
  ).toBe(QUEUE_RECORD.url)
})

it('14. Fn::GetAtt "MyQueue.Arn" (string short-form) → queue ARN', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::GetAtt': 'MyQueue.Arn' }, ctx)).toBe(
    QUEUE_RECORD.arn,
  )
})

it('15. Fn::GetAtt ["Unknown", "X"] → throws OFFLINE_UNRESOLVED_GETATT', () => {
  expect(() =>
    resolveIntrinsics({ 'Fn::GetAtt': ['Unknown', 'X'] }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_UNRESOLVED_GETATT' }))
})

it('16. Fn::GetAtt ["MyQueue", "NotAnAttribute"] → throws OFFLINE_UNRESOLVED_GETATT', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(() =>
    resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', 'NotAnAttribute'] }, ctx),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_UNRESOLVED_GETATT' }))
})

// ---------------------------------------------------------------------------
// 17. Fn::Sub → throws OFFLINE_UNSUPPORTED_INTRINSIC with key in message
// ---------------------------------------------------------------------------

it('17. { "Fn::Sub": "foo" } → throws OFFLINE_UNSUPPORTED_INTRINSIC with Fn::Sub in message', () => {
  expect(() => resolveIntrinsics({ 'Fn::Sub': 'foo' }, makeContext())).toThrow(
    expect.objectContaining({
      code: 'OFFLINE_UNSUPPORTED_INTRINSIC',
      message: expect.stringContaining('Fn::Sub'),
    }),
  )
})

// ---------------------------------------------------------------------------
// 18. Fn::ImportValue → throws OFFLINE_CROSS_STACK_IMPORT
// ---------------------------------------------------------------------------

it('18. { "Fn::ImportValue": "X" } → throws OFFLINE_CROSS_STACK_IMPORT', () => {
  expect(() =>
    resolveIntrinsics({ 'Fn::ImportValue': 'X' }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_CROSS_STACK_IMPORT' }))
})

// ---------------------------------------------------------------------------
// 19. Array recursion
// ---------------------------------------------------------------------------

it('19. array recursion: [{ Ref: "AWS::Region" }, "plain"] → ["us-east-1", "plain"]', () => {
  expect(
    resolveIntrinsics([{ Ref: 'AWS::Region' }, 'plain'], makeContext()),
  ).toEqual(['us-east-1', 'plain'])
})

// ---------------------------------------------------------------------------
// 20. Object recursion
// ---------------------------------------------------------------------------

it('20. object recursion: { region: { Ref: "AWS::Region" }, x: 1 } → { region: "us-east-1", x: 1 }', () => {
  expect(
    resolveIntrinsics({ region: { Ref: 'AWS::Region' }, x: 1 }, makeContext()),
  ).toEqual({ region: 'us-east-1', x: 1 })
})

// ---------------------------------------------------------------------------
// 21. AWS::NoValue sentinel drops keys
// ---------------------------------------------------------------------------

it('21. AWS::NoValue sentinel drops the key from the containing object', () => {
  // Pass the sentinel directly as a value in a plain object (no intrinsic
  // wrapper needed — the walker must drop any value === Symbol.for('AWS::NoValue')).
  const noValue = Symbol.for('AWS::NoValue')
  const input = { a: 1, b: noValue }
  expect(resolveIntrinsics(input, makeContext())).toEqual({ a: 1 })
})

it('21b. { Ref: "AWS::NoValue" } in an object → key is dropped', () => {
  const ctx = makeContext()
  // pseudoParams includes AWS::NoValue → Symbol.for('AWS::NoValue')
  expect(
    resolveIntrinsics({ keep: 'yes', drop: { Ref: 'AWS::NoValue' } }, ctx),
  ).toEqual({ keep: 'yes' })
})
