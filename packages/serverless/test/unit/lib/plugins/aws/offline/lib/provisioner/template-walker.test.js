import { walkResources } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/template-walker.js'
import { createRegistry } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/registry.js'

// The walker only resolves resource Properties; an identity resolver is enough
// for these tests since no intrinsics are present in the fixtures.
const identity = (value) => value

function walk(template, overrides = {}) {
  const registry = createRegistry()
  walkResources(template, {
    resolveIntrinsics: identity,
    conditions: new Map(),
    registry,
    awsApiPort: 3002,
    ...overrides,
  })
  return registry
}

describe('walkResources', () => {
  it('dispatches each supported type to its lifter and registers it', () => {
    const registry = walk({
      Resources: {
        MyQueue: { Type: 'AWS::SQS::Queue', Properties: {} },
        MyTopic: { Type: 'AWS::SNS::Topic', Properties: {} },
        MyBucket: { Type: 'AWS::S3::Bucket', Properties: {} },
        MyBus: { Type: 'AWS::Events::EventBus', Properties: {} },
        MyRule: { Type: 'AWS::Events::Rule', Properties: {} },
      },
    })

    expect(registry.sqs.has('MyQueue')).toBe(true)
    expect(registry.sns.has('MyTopic')).toBe(true)
    expect(registry.s3.has('MyBucket')).toBe(true)
    expect(registry.events.has('MyBus')).toBe(true)
    expect(registry.events.get('MyBus').kind).toBe('bus')
    expect(registry.events.has('MyRule')).toBe(true)
    expect(registry.events.get('MyRule').kind).toBe('rule')
  })

  it('passes awsApiPort through to the SQS lifter', () => {
    const registry = walk(
      { Resources: { MyQueue: { Type: 'AWS::SQS::Queue' } } },
      { awsApiPort: 4567 },
    )
    expect(registry.sqs.get('MyQueue').url).toContain(':4567/')
  })

  it('skips a resource whose Condition evaluates to false', () => {
    const registry = walk(
      {
        Resources: {
          Gated: { Type: 'AWS::SQS::Queue', Condition: 'CreateGated' },
          Always: { Type: 'AWS::SQS::Queue' },
        },
      },
      { conditions: new Map([['CreateGated', false]]) },
    )

    expect(registry.sqs.has('Gated')).toBe(false)
    expect(registry.sqs.has('Always')).toBe(true)
  })

  it('keeps a resource whose Condition evaluates to true', () => {
    const registry = walk(
      {
        Resources: {
          Gated: { Type: 'AWS::SQS::Queue', Condition: 'CreateGated' },
        },
      },
      { conditions: new Map([['CreateGated', true]]) },
    )

    expect(registry.sqs.has('Gated')).toBe(true)
  })

  it('ignores unsupported resource types', () => {
    const registry = walk({
      Resources: {
        Role: { Type: 'AWS::IAM::Role' },
        Table: { Type: 'AWS::DynamoDB::Table' },
      },
    })

    expect(registry.sqs.size).toBe(0)
    expect(registry.sns.size).toBe(0)
    expect(registry.s3.size).toBe(0)
    expect(registry.events.size).toBe(0)
  })

  it('handles a template with no Resources block without error', () => {
    expect(() => walk({})).not.toThrow()
  })

  it('skips resources whose logical id is in the exclude set', () => {
    const registry = walk(
      {
        Resources: {
          ServerlessDeploymentBucket: { Type: 'AWS::S3::Bucket' },
          UploadsBucket: { Type: 'AWS::S3::Bucket' },
        },
      },
      { exclude: new Set(['ServerlessDeploymentBucket']) },
    )

    expect(registry.s3.has('ServerlessDeploymentBucket')).toBe(false)
    expect(registry.s3.has('UploadsBucket')).toBe(true)
  })
})
