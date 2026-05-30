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

it('9d. { Ref: "MyLambda" } → lambda function name', () => {
  const ctx = makeContext({
    registry: makeRegistry({ lambda: [['MyLambda', LAMBDA_RECORD]] }),
  })
  expect(resolveIntrinsics({ Ref: 'MyLambda' }, ctx)).toBe(LAMBDA_RECORD.name)
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

it('14b. Fn::GetAtt ["MyTopic", "TopicArn" | "TopicName"] → SNS attributes', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sns: [['MyTopic', TOPIC_RECORD]] }),
  })
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyTopic', 'TopicArn'] }, ctx),
  ).toBe(TOPIC_RECORD.arn)
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyTopic', 'TopicName'] }, ctx),
  ).toBe(TOPIC_RECORD.name)
})

it('14c. Fn::GetAtt for S3 bucket attributes', () => {
  const ctx = makeContext({
    registry: makeRegistry({ s3: [['MyBucket', BUCKET_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['MyBucket', 'Arn'] }, ctx)).toBe(
    'arn:aws:s3:::my-bucket',
  )
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyBucket', 'DomainName'] }, ctx),
  ).toBe('my-bucket.s3.amazonaws.com')
  expect(
    resolveIntrinsics(
      { 'Fn::GetAtt': ['MyBucket', 'RegionalDomainName'] },
      ctx,
    ),
  ).toBe('my-bucket.s3.us-east-1.amazonaws.com')
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyBucket', 'WebsiteURL'] }, ctx),
  ).toBe('http://my-bucket.s3-website-us-east-1.amazonaws.com')
})

it('14c2. Fn::GetAtt ["MyBucket", "DualStackDomainName"] → dual-stack DNS', () => {
  const ctx = makeContext({
    registry: makeRegistry({ s3: [['MyBucket', BUCKET_RECORD]] }),
  })
  expect(
    resolveIntrinsics(
      { 'Fn::GetAtt': ['MyBucket', 'DualStackDomainName'] },
      ctx,
    ),
  ).toBe('my-bucket.s3.dualstack.us-east-1.amazonaws.com')
})

it('14d. Fn::GetAtt for EventBridge Arn and Name', () => {
  const ctx = makeContext({
    registry: makeRegistry({ events: [['MyBus', EVENT_BUS_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['MyBus', 'Arn'] }, ctx)).toBe(
    EVENT_BUS_RECORD.arn,
  )
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['MyBus', 'Name'] }, ctx)).toBe(
    EVENT_BUS_RECORD.name,
  )
})

it('14e. Fn::GetAtt for Lambda Arn', () => {
  const ctx = makeContext({
    registry: makeRegistry({ lambda: [['MyLambda', LAMBDA_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['MyLambda', 'Arn'] }, ctx)).toBe(
    LAMBDA_RECORD.arn,
  )
})

it('14f. Fn::GetAtt resolves an intrinsic attribute first', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
    parameters: { AttrParam: 'Arn' },
  })
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', { Ref: 'AttrParam' }] }, ctx),
  ).toBe(QUEUE_RECORD.arn)
})

it('15. Fn::GetAtt ["Unknown", "X"] → UNRESOLVED + warning', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(resolveIntrinsics({ 'Fn::GetAtt': ['Unknown', 'X'] }, ctx)).toBe(
    UNRESOLVED,
  )
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_UNRESOLVED_REFERENCE',
      reference: 'Unknown.X',
      detail: expect.any(String),
    },
  ])
})

it('16. Fn::GetAtt ["MyQueue", "NotAnAttribute"] → UNRESOLVED + warning', () => {
  const warnings = []
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
    warnings,
  })
  expect(
    resolveIntrinsics({ 'Fn::GetAtt': ['MyQueue', 'NotAnAttribute'] }, ctx),
  ).toBe(UNRESOLVED)
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_UNRESOLVED_REFERENCE',
      reference: 'MyQueue.NotAnAttribute',
      detail: expect.any(String),
    },
  ])
})

it('16b. structurally malformed Fn::GetAtt → throws OFFLINE_MALFORMED_INTRINSIC', () => {
  expect(() =>
    resolveIntrinsics({ 'Fn::GetAtt': ['OnlyOne'] }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }))
  expect(() =>
    resolveIntrinsics({ 'Fn::GetAtt': 'NoDotHere' }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }))
})

// ---------------------------------------------------------------------------
// 17. Fn::Sub → throws OFFLINE_UNSUPPORTED_INTRINSIC with key in message
// ---------------------------------------------------------------------------

it('17. Fn::Sub string form with no variables → literal string', () => {
  expect(resolveIntrinsics({ 'Fn::Sub': 'foo' }, makeContext())).toBe('foo')
})

it('17a. Fn::Sub string form substitutes pseudo-parameters', () => {
  expect(
    resolveIntrinsics({ 'Fn::Sub': 'region-${AWS::Region}' }, makeContext()),
  ).toBe('region-us-east-1')
})

it('17b. Fn::Sub string form substitutes ${LogicalId} via Ref semantics', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::Sub': 'url=${MyQueue}' }, ctx)).toBe(
    `url=${QUEUE_RECORD.url}`,
  )
})

it('17c. Fn::Sub string form substitutes ${LogicalId.Attr} via GetAtt semantics', () => {
  const ctx = makeContext({
    registry: makeRegistry({ sqs: [['MyQueue', QUEUE_RECORD]] }),
  })
  expect(resolveIntrinsics({ 'Fn::Sub': 'arn=${MyQueue.Arn}' }, ctx)).toBe(
    `arn=${QUEUE_RECORD.arn}`,
  )
})

it('17d. Fn::Sub escapes ${!Literal} to a literal ${Literal}', () => {
  expect(
    resolveIntrinsics(
      { 'Fn::Sub': '${!NotResolved}-${AWS::Region}' },
      makeContext(),
    ),
  ).toBe('${NotResolved}-us-east-1')
})

it('17e. Fn::Sub map form resolves variables which take precedence', () => {
  const ctx = makeContext()
  expect(
    resolveIntrinsics(
      {
        'Fn::Sub': [
          '${greeting}-${AWS::Region}',
          { greeting: { Ref: 'AWS::Partition' } },
        ],
      },
      ctx,
    ),
  ).toBe('aws-us-east-1')
})

it('17f. Fn::Sub becomes UNRESOLVED + warning when a component is unresolvable', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(resolveIntrinsics({ 'Fn::Sub': 'x-${Unknown}' }, ctx)).toBe(UNRESOLVED)
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatchObject({ code: 'OFFLINE_UNRESOLVED_REFERENCE' })
})

it('17g. Fn::Sub map form becomes UNRESOLVED when a var value is unresolvable', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(
    resolveIntrinsics({ 'Fn::Sub': ['${x}', { x: { Ref: 'Unknown' } }] }, ctx),
  ).toBe(UNRESOLVED)
  expect(warnings).toHaveLength(1)
})

// ---------------------------------------------------------------------------
// 17h-17u. Fn::Join, Fn::Select, Fn::Split, Fn::FindInMap, Fn::If
// ---------------------------------------------------------------------------

it('17h. Fn::Join joins a resolved list with the delimiter', () => {
  const ctx = makeContext()
  expect(
    resolveIntrinsics(
      { 'Fn::Join': ['-', ['a', { Ref: 'AWS::Region' }, 'c']] },
      ctx,
    ),
  ).toBe('a-us-east-1-c')
})

it('17i. Fn::Join becomes UNRESOLVED + warning when a member is unresolvable', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(
    resolveIntrinsics({ 'Fn::Join': ['-', ['a', { Ref: 'Unknown' }]] }, ctx),
  ).toBe(UNRESOLVED)
  expect(warnings).toHaveLength(1)
})

it('17j. Fn::Select returns the element at the index', () => {
  const ctx = makeContext()
  expect(resolveIntrinsics({ 'Fn::Select': [1, ['a', 'b', 'c']] }, ctx)).toBe(
    'b',
  )
})

it('17k. Fn::Select with an out-of-range index → throws OFFLINE_MALFORMED_INTRINSIC', () => {
  expect(() =>
    resolveIntrinsics({ 'Fn::Select': [5, ['a', 'b']] }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }))
})

it('17l. Fn::Select over a non-array list value → UNRESOLVED + warning, no throw', () => {
  // A CommaDelimitedList parameter resolves to a plain string, so selecting
  // from it must degrade gracefully rather than crash boot on a valid template.
  const warnings = []
  const ctx = makeContext({
    parameters: { ListParam: 'a,b,c' },
    warnings,
  })
  let result
  expect(() => {
    result = resolveIntrinsics({ 'Fn::Select': [0, { Ref: 'ListParam' }] }, ctx)
  }).not.toThrow()
  expect(result).toBe(UNRESOLVED)
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatchObject({ code: 'OFFLINE_UNRESOLVED_REFERENCE' })
})

it('17m. Fn::Split splits the string on the delimiter', () => {
  const ctx = makeContext()
  expect(resolveIntrinsics({ 'Fn::Split': [',', 'a,b,c'] }, ctx)).toEqual([
    'a',
    'b',
    'c',
  ])
})

it('17n. Fn::FindInMap returns the nested value', () => {
  const ctx = makeContext({
    mappings: { RegionMap: { 'us-east-1': { ami: 'ami-123' } } },
  })
  expect(
    resolveIntrinsics(
      { 'Fn::FindInMap': ['RegionMap', { Ref: 'AWS::Region' }, 'ami'] },
      ctx,
    ),
  ).toBe('ami-123')
})

it('17o. Fn::FindInMap with a missing path → UNRESOLVED + warning', () => {
  const warnings = []
  const ctx = makeContext({ warnings, mappings: { RegionMap: {} } })
  expect(
    resolveIntrinsics(
      { 'Fn::FindInMap': ['RegionMap', 'eu-west-1', 'ami'] },
      ctx,
    ),
  ).toBe(UNRESOLVED)
  expect(warnings).toHaveLength(1)
})

it('17p. Fn::If returns the chosen branch (true)', () => {
  const ctx = makeContext({ conditions: new Map([['IsProd', true]]) })
  expect(resolveIntrinsics({ 'Fn::If': ['IsProd', 'prod', 'dev'] }, ctx)).toBe(
    'prod',
  )
})

it('17q. Fn::If returns the chosen branch (false) and resolves it', () => {
  const ctx = makeContext({ conditions: new Map([['IsProd', false]]) })
  expect(
    resolveIntrinsics(
      { 'Fn::If': ['IsProd', 'prod', { Ref: 'AWS::Region' }] },
      ctx,
    ),
  ).toBe('us-east-1')
})

it('17r. Fn::If with an unknown condition name → throws OFFLINE_MALFORMED_INTRINSIC', () => {
  expect(() =>
    resolveIntrinsics({ 'Fn::If': ['Nope', 'a', 'b'] }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_MALFORMED_INTRINSIC' }))
})

// ---------------------------------------------------------------------------
// 18. Fn::ImportValue → UNRESOLVED + cross-stack warning (boot must not crash)
// ---------------------------------------------------------------------------

it('18. { "Fn::ImportValue": "X" } → UNRESOLVED + cross-stack warning', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(resolveIntrinsics({ 'Fn::ImportValue': 'X' }, ctx)).toBe(UNRESOLVED)
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_CROSS_STACK_REFERENCE',
      reference: 'X',
      detail: expect.any(String),
    },
  ])
})

it('18b. Fn::ImportValue with an intrinsic name still warns cross-stack', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(
    resolveIntrinsics(
      { 'Fn::ImportValue': { 'Fn::Sub': '${AWS::Region}-export' } },
      ctx,
    ),
  ).toBe(UNRESOLVED)
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_CROSS_STACK_REFERENCE',
      reference: 'us-east-1-export',
      detail: expect.any(String),
    },
  ])
})

// ---------------------------------------------------------------------------
// 18c-18e. Unknown Fn::* and propagation
// ---------------------------------------------------------------------------

it('18c. an unknown Fn::* key → UNRESOLVED + warning (never throws)', () => {
  const warnings = []
  const ctx = makeContext({ warnings })
  expect(resolveIntrinsics({ 'Fn::GetAZs': 'us-east-1' }, ctx)).toBe(UNRESOLVED)
  expect(warnings).toEqual([
    {
      code: 'OFFLINE_UNRESOLVED_REFERENCE',
      reference: 'Fn::GetAZs',
      detail: expect.any(String),
    },
  ])
})

it('18d. an array with an UNRESOLVED element becomes UNRESOLVED', () => {
  const ctx = makeContext()
  expect(resolveIntrinsics({ list: ['a', { Ref: 'Unknown' }] }, ctx)).toEqual(
    {},
  )
})

it('18e. NO_VALUE in an array drops that element but keeps the array', () => {
  const ctx = makeContext()
  expect(
    resolveIntrinsics({ list: ['a', { Ref: 'AWS::NoValue' }, 'b'] }, ctx),
  ).toEqual({ list: ['a', 'b'] })
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
