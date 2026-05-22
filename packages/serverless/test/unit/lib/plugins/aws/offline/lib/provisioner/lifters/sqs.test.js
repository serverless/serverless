import { liftSqsQueue } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/lifters/sqs.js'
import { createRegistry } from '../../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_PSEUDO = {
  'AWS::AccountId': '000000000000',
  'AWS::Region': 'us-east-1',
  'AWS::Partition': 'aws',
  'AWS::URLSuffix': 'amazonaws.com',
  'AWS::StackName': 'my-service-dev',
  'AWS::NoValue': Symbol.for('AWS::NoValue'),
}

/**
 * Returns a minimal context suitable for most tests.
 * Provides an identity resolver so callers can replace it with a spy.
 */
function makeContext({ resolveIntrinsics } = {}) {
  return {
    resolveIntrinsics: resolveIntrinsics ?? ((value) => value),
    registry: createRegistry(),
    pseudoParams: BASE_PSEUDO,
  }
}

// ---------------------------------------------------------------------------
// 1. Basic lift — no Properties
// ---------------------------------------------------------------------------

it('1. lifts a basic SQS resource with no Properties', () => {
  const record = liftSqsQueue(
    'MyQueue',
    { Type: 'AWS::SQS::Queue' },
    makeContext(),
  )

  expect(record.logicalId).toBe('MyQueue')
  expect(record.name).toBe('MyQueue')
  expect(typeof record.arn).toBe('string')
  expect(typeof record.url).toBe('string')
  expect(record.properties).toEqual({})
})

// ---------------------------------------------------------------------------
// 2. Explicit QueueName literal
// ---------------------------------------------------------------------------

it('2. uses Properties.QueueName as name when it is a literal string', () => {
  const record = liftSqsQueue(
    'MyQueue',
    { Type: 'AWS::SQS::Queue', Properties: { QueueName: 'my-explicit-name' } },
    makeContext(),
  )

  expect(record.name).toBe('my-explicit-name')
  expect(record.logicalId).toBe('MyQueue')
})

// ---------------------------------------------------------------------------
// 3. Other properties are preserved in record.properties
// ---------------------------------------------------------------------------

it('3. preserves other Properties in record.properties', () => {
  const record = liftSqsQueue(
    'MyQueue',
    { Type: 'AWS::SQS::Queue', Properties: { VisibilityTimeout: 30 } },
    makeContext(),
  )

  expect(record.properties).toEqual({ VisibilityTimeout: 30 })
})

// ---------------------------------------------------------------------------
// 4. Wrong type throws OFFLINE_LIFTER_WRONG_TYPE
// ---------------------------------------------------------------------------

it('4. throws OFFLINE_LIFTER_WRONG_TYPE for wrong CFN resource type', () => {
  expect(() =>
    liftSqsQueue('MyBucket', { Type: 'AWS::S3::Bucket' }, makeContext()),
  ).toThrow(expect.objectContaining({ code: 'OFFLINE_LIFTER_WRONG_TYPE' }))
})

// ---------------------------------------------------------------------------
// 5. resolveIntrinsics is invoked on the Properties object
// ---------------------------------------------------------------------------

it('5. calls resolveIntrinsics on the Properties object', () => {
  const calls = []
  const fakeResolver = (value) => {
    calls.push(value)
    return value
  }

  const props = { VisibilityTimeout: { Ref: 'SomeParam' } }
  liftSqsQueue(
    'MyQueue',
    { Type: 'AWS::SQS::Queue', Properties: props },
    makeContext({ resolveIntrinsics: fakeResolver }),
  )

  expect(calls.length).toBeGreaterThan(0)
  expect(calls[0]).toBe(props)
})

// ---------------------------------------------------------------------------
// 6. ARN / URL format spot-check
// ---------------------------------------------------------------------------

it('6a. ARN includes the expected sqs segment', () => {
  const record = liftSqsQueue(
    'MyQueue',
    { Type: 'AWS::SQS::Queue' },
    makeContext(),
  )
  expect(record.arn).toContain(':sqs:us-east-1:000000000000:')
})

it('6b. URL is http://localhost:3002/000000000000/<name>', () => {
  const record = liftSqsQueue(
    'TheQueue',
    { Type: 'AWS::SQS::Queue' },
    makeContext(),
  )
  expect(record.url).toBe('http://localhost:3002/000000000000/TheQueue')
})
