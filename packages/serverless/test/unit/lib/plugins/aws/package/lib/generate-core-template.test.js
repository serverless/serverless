import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { warning: jest.fn(), info: jest.fn() },
}))
const { log } = await import('@serverless/util')

const mixin = (
  await import('../../../../../../../lib/plugins/aws/package/lib/generate-core-template.js')
).default

const coreTemplate = () => ({
  Resources: {
    ServerlessDeploymentBucket: { Type: 'AWS::S3::Bucket', Properties: {} },
    ServerlessDeploymentBucketPolicy: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: { PolicyDocument: { Statement: [{ Sid: 'DenyInsecure' }] } },
    },
  },
  Outputs: { ServerlessDeploymentBucketName: { Value: '' } },
})

const buildCtx = ({ referenceMode, deploymentBucketObject }) => ({
  ...mixin,
  provider: {
    isReferenceCodeStorageMode: () => referenceMode,
    naming: {
      getDeploymentBucketLogicalId: () => 'ServerlessDeploymentBucket',
      getDeploymentBucketPolicyLogicalId: () =>
        'ServerlessDeploymentBucketPolicy',
      getCoreTemplateFileName: () => 'core-cloudformation-template.json',
    },
    isS3TransferAccelerationSupported: () => false,
    isS3TransferAccelerationEnabled: () => false,
    isS3TransferAccelerationDisabled: () => false,
  },
  serverless: {
    config: { serverlessPath: '/x' },
    serviceDir: '/tmp/svc',
    utils: {
      readFileSync: () => coreTemplate(),
      writeFileSync: jest.fn(),
    },
    service: {
      provider: { deploymentBucketObject },
      package: {},
    },
  },
})

describe('generateCoreTemplate — reference mode, legacy in-stack bucket', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires versioning: true', () => {
    const ctx = buildCtx({
      referenceMode: true,
      deploymentBucketObject: { codeStorageMode: 'reference' },
    })
    expect(() => ctx.generateCoreTemplate()).toThrow(/versioning/)
  })

  it('appends the Lambda-read statement to the bucket policy', () => {
    const ctx = buildCtx({
      referenceMode: true,
      deploymentBucketObject: {
        codeStorageMode: 'reference',
        versioning: true,
      },
    })
    ctx.generateCoreTemplate()
    const statements =
      ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .ServerlessDeploymentBucketPolicy.Properties.PolicyDocument.Statement
    const stmt = statements.find(
      (s) => s.Sid === 'ServerlessLambdaSelfManagedCodeAccess',
    )
    expect(stmt).toBeDefined()
    expect(stmt.Principal).toEqual({ Service: 'lambda.amazonaws.com' })
    expect(stmt.Condition.StringEquals['aws:SourceAccount']).toEqual({
      Ref: 'AWS::AccountId',
    })
    // Exact action set: read-only access to the current object AND every
    // specific version (Lambda pins exact S3ObjectVersions in reference mode).
    expect(stmt.Action).toEqual(['s3:GetObject', 's3:GetObjectVersion'])
    // Exact resource shape: join('', ['arn:aws:s3:::', {Ref: <bucket logical
    // id>}, '/*']) — a wildcard over every object in the deployment bucket,
    // built from the actual bucket logical id rather than a literal string.
    expect(stmt.Resource).toEqual({
      'Fn::Join': [
        '',
        ['arn:aws:s3:::', { Ref: 'ServerlessDeploymentBucket' }, '/*'],
      ],
    })
    expect(statements.find((s) => s.Sid === 'DenyInsecure')).toBeDefined()
  })

  it('warns instead of adding the statement when skipPolicySetup is set', () => {
    const ctx = buildCtx({
      referenceMode: true,
      deploymentBucketObject: {
        codeStorageMode: 'reference',
        versioning: true,
        skipPolicySetup: true,
      },
    })
    ctx.generateCoreTemplate()
    expect(log.warning).toHaveBeenCalled()
    expect(
      ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .ServerlessDeploymentBucketPolicy,
    ).toBeUndefined()
  })

  it('does not touch the policy in copy mode', () => {
    const ctx = buildCtx({ referenceMode: false, deploymentBucketObject: {} })
    ctx.generateCoreTemplate()
    const statements =
      ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .ServerlessDeploymentBucketPolicy.Properties.PolicyDocument.Statement
    expect(statements).toHaveLength(1)
  })
})
