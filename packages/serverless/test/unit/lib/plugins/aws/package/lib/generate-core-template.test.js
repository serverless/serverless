import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals'

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

const buildCtx = ({
  referenceMode,
  deploymentBucketObject,
  webApps,
  options = {},
  enableLegacyDeploymentBucket,
}) => ({
  ...mixin,
  provider: {
    options,
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
      provider: { deploymentBucketObject, enableLegacyDeploymentBucket },
      package: {},
    },
    configurationInput: { webApps },
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

describe('generateCoreTemplate — web apps, legacy in-stack bucket', () => {
  const webApps = { api: { entry: 'src/server.js' } }

  beforeEach(() => jest.clearAllMocks())

  it('appends the Lambda-read statement to the bucket policy', () => {
    const ctx = buildCtx({
      referenceMode: false,
      deploymentBucketObject: { versioning: true },
      webApps,
    })
    ctx.generateCoreTemplate()
    const statements =
      ctx.serverless.service.provider.compiledCloudFormationTemplate.Resources
        .ServerlessDeploymentBucketPolicy.Properties.PolicyDocument.Statement
    expect(statements.map(({ Sid }) => Sid)).toEqual([
      'DenyInsecure',
      'ServerlessLambdaSelfManagedCodeAccess',
    ])
  })
})

describe('generateCoreTemplate — in-stack bucket messages', () => {
  const webApps = { api: { entry: 'src/server.js' } }
  const versioningReference =
    '"codeStorageMode: reference" with the in-stack deployment bucket requires "deploymentBucket.versioning: true".'
  const skipPolicyReference =
    '"codeStorageMode: reference" with "skipPolicySetup: true": make sure your deployment bucket policy grants the Lambda service principal s3:GetObject and s3:GetObjectVersion.'
  const skipPolicyWebApps =
    'Web apps (webApps) with "deploymentBucket.skipPolicySetup: true": make sure your deployment bucket policy grants the Lambda service principal s3:GetObject and s3:GetObjectVersion.'
  const versioningError = (ctx) => {
    try {
      ctx.generateCoreTemplate()
    } catch (error) {
      return error
    }
    throw new Error('generateCoreTemplate did not throw')
  }

  const originalLegacyEnv = process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET
  })
  afterEach(() => {
    if (originalLegacyEnv === undefined) {
      delete process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET
    } else {
      process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET = originalLegacyEnv
    }
  })

  describe('without deploymentBucket.versioning: true', () => {
    it('names codeStorageMode in reference mode only', () => {
      const error = versioningError(
        buildCtx({
          referenceMode: true,
          deploymentBucketObject: { codeStorageMode: 'reference' },
        }),
      )
      expect(error.code).toBe(
        'REFERENCE_MODE_LEGACY_BUCKET_VERSIONING_REQUIRED',
      )
      expect(error.stack).toBeUndefined()
      expect(error.message).toBe(versioningReference)
    })

    it('names codeStorageMode in reference mode with web apps', () => {
      const error = versioningError(
        buildCtx({
          referenceMode: true,
          deploymentBucketObject: { codeStorageMode: 'reference' },
          webApps,
        }),
      )
      expect(error.code).toBe(
        'REFERENCE_MODE_LEGACY_BUCKET_VERSIONING_REQUIRED',
      )
      expect(error.stack).toBeUndefined()
      expect(error.message).toBe(versioningReference)
    })

    it('names provider.enableLegacyDeploymentBucket for web apps', () => {
      const error = versioningError(
        buildCtx({
          referenceMode: false,
          deploymentBucketObject: {},
          enableLegacyDeploymentBucket: true,
          webApps,
        }),
      )
      expect(error.code).toBe(
        'REFERENCE_MODE_LEGACY_BUCKET_VERSIONING_REQUIRED',
      )
      expect(error.stack).toBeUndefined()
      expect(error.message).toBe(
        'Web apps (webApps) need a versioned deployment bucket. With "provider.enableLegacyDeploymentBucket", set "provider.deploymentBucket.versioning: true".',
      )
    })

    it('names the --enable-legacy-deployment-bucket option for web apps', () => {
      const error = versioningError(
        buildCtx({
          referenceMode: false,
          options: { 'enable-legacy-deployment-bucket': true },
          enableLegacyDeploymentBucket: true,
          webApps,
        }),
      )
      expect(error.message).toBe(
        'Web apps (webApps) need a versioned deployment bucket. With the --enable-legacy-deployment-bucket option, set "provider.deploymentBucket.versioning: true".',
      )
    })

    it('names the ENABLE_LEGACY_DEPLOYMENT_BUCKET environment variable for web apps', () => {
      process.env.ENABLE_LEGACY_DEPLOYMENT_BUCKET = 'true'
      const error = versioningError(buildCtx({ referenceMode: false, webApps }))
      expect(error.message).toBe(
        'Web apps (webApps) need a versioned deployment bucket. With the ENABLE_LEGACY_DEPLOYMENT_BUCKET environment variable, set "provider.deploymentBucket.versioning: true".',
      )
    })

    it('names no legacy setting for web apps when the stack already has the bucket', () => {
      const error = versioningError(buildCtx({ referenceMode: false, webApps }))
      expect(error.code).toBe(
        'REFERENCE_MODE_LEGACY_BUCKET_VERSIONING_REQUIRED',
      )
      expect(error.stack).toBeUndefined()
      expect(error.message).toBe(
        'Web apps (webApps) need a versioned deployment bucket. This service\'s deployment bucket is in its CloudFormation stack, so set "provider.deploymentBucket.versioning: true".',
      )
    })
  })

  describe('with deploymentBucket.skipPolicySetup: true', () => {
    it.each([
      ['reference mode only', { referenceMode: true }, skipPolicyReference],
      ['web apps only', { referenceMode: false, webApps }, skipPolicyWebApps],
      [
        'reference mode with web apps',
        { referenceMode: true, webApps },
        skipPolicyReference,
      ],
    ])('warns in its own words: %s', (name, options, expected) => {
      buildCtx({
        ...options,
        deploymentBucketObject: {
          ...(options.referenceMode ? { codeStorageMode: 'reference' } : {}),
          versioning: true,
          skipPolicySetup: true,
        },
      }).generateCoreTemplate()
      expect(log.warning).toHaveBeenCalledTimes(1)
      expect(log.warning.mock.calls[0][0]).toBe(expected)
    })
  })
})
