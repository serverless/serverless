import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: { info: jest.fn(), warning: jest.fn() },
}))
const { log } = await import('@serverless/util')

const mixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/ensure-reference-code-storage.js')
).default

const buildCtx = ({
  referenceMode = true,
  customBucketName = undefined,
  globalBucketUsed = false,
  requestImpl,
} = {}) => ({
  ...mixin,
  bucketName:
    customBucketName || 'serverless-framework-deployments-us-east-1-abc',
  globalDeploymentBucketUsed: globalBucketUsed,
  provider: {
    isReferenceCodeStorageMode: () => referenceMode,
    getAccountId: async () => '111122223333',
    request: requestImpl,
  },
  serverless: {
    service: { provider: { deploymentBucket: customBucketName } },
  },
})

describe('ensureReferenceCodeStoragePrereqs', () => {
  it('does nothing in copy mode', async () => {
    const request = jest.fn()
    const ctx = buildCtx({ referenceMode: false, requestImpl: request })
    await ctx.ensureReferenceCodeStoragePrereqs()
    expect(request).not.toHaveBeenCalled()
  })

  it('adds the policy statement to the global bucket when missing', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketPolicy') {
        const err = new Error('The bucket policy does not exist')
        err.code = 'AWS_S3_GET_BUCKET_POLICY_NO_SUCH_BUCKET_POLICY'
        err.providerError = { code: 'NoSuchBucketPolicy' }
        throw err
      }
      return {}
    })
    const ctx = buildCtx({ globalBucketUsed: true, requestImpl: request })
    await ctx.ensureReferenceCodeStoragePrereqs()
    const putCall = request.mock.calls.find(([, m]) => m === 'putBucketPolicy')
    expect(putCall).toBeDefined()
    const policy = JSON.parse(putCall[2].Policy)
    const stmt = policy.Statement.find(
      (s) => s.Sid === 'ServerlessLambdaSelfManagedCodeAccess',
    )
    expect(stmt.Principal).toEqual({ Service: 'lambda.amazonaws.com' })
    expect(stmt.Action).toEqual(['s3:GetObject', 's3:GetObjectVersion'])
    expect(stmt.Condition).toEqual({
      StringEquals: { 'aws:SourceAccount': '111122223333' },
    })
  })

  it('rethrows non-NoSuchBucketPolicy errors from getBucketPolicy on the global bucket', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketPolicy') {
        throw Object.assign(new Error('Access Denied'), {
          code: 'AWS_S3_GET_BUCKET_POLICY_ACCESS_DENIED',
          providerError: { code: 'AccessDenied' },
        })
      }
      return {}
    })
    const ctx = buildCtx({ globalBucketUsed: true, requestImpl: request })
    await expect(ctx.ensureReferenceCodeStoragePrereqs()).rejects.toThrow(
      'Access Denied',
    )
    expect(
      request.mock.calls.find(([, m]) => m === 'putBucketPolicy'),
    ).toBeUndefined()
  })

  it('is idempotent — leaves an existing statement (and others) alone', async () => {
    const existing = {
      Version: '2012-10-17',
      Statement: [
        { Sid: 'SomethingElse', Effect: 'Deny' },
        { Sid: 'ServerlessLambdaSelfManagedCodeAccess', Effect: 'Allow' },
      ],
    }
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketPolicy')
        return { Policy: JSON.stringify(existing) }
      return {}
    })
    const ctx = buildCtx({ globalBucketUsed: true, requestImpl: request })
    await ctx.ensureReferenceCodeStoragePrereqs()
    expect(
      request.mock.calls.find(([, m]) => m === 'putBucketPolicy'),
    ).toBeUndefined()
  })

  it('hard-fails on a custom bucket without versioning', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketVersioning') return {}
      return {}
    })
    const ctx = buildCtx({
      customBucketName: 'my-bucket',
      requestImpl: request,
    })
    await expect(ctx.ensureReferenceCodeStoragePrereqs()).rejects.toThrow(
      /versioning/,
    )
  })

  it('warns (does not fail) on a custom bucket whose policy lacks the Lambda grant', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketVersioning') return { Status: 'Enabled' }
      if (method === 'getBucketPolicy')
        return {
          Policy: JSON.stringify({ Version: '2012-10-17', Statement: [] }),
        }
      return {}
    })
    const ctx = buildCtx({
      customBucketName: 'my-bucket',
      requestImpl: request,
    })
    await ctx.ensureReferenceCodeStoragePrereqs()
    expect(log.warning).toHaveBeenCalled()
    expect(log.warning.mock.calls[0][0]).toContain('111122223333')
    expect(log.warning.mock.calls[0][0]).not.toContain('<your-account-id>')
    expect(
      request.mock.calls.find(([, m]) => m === 'putBucketPolicy'),
    ).toBeUndefined()
  })

  it('hard-fails on a custom bucket with no policy at all (NoSuchBucketPolicy)', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketVersioning') return { Status: 'Enabled' }
      if (method === 'getBucketPolicy') {
        const err = new Error('The bucket policy does not exist')
        err.code = 'AWS_S3_GET_BUCKET_POLICY_NO_SUCH_BUCKET_POLICY'
        err.providerError = { code: 'NoSuchBucketPolicy' }
        throw err
      }
      return {}
    })
    const ctx = buildCtx({
      customBucketName: 'my-bucket',
      requestImpl: request,
    })
    let caught
    try {
      await ctx.ensureReferenceCodeStoragePrereqs()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('REFERENCE_MODE_BUCKET_POLICY_MISSING')
    expect(caught.message).toContain('my-bucket')
    expect(caught.message).toContain('lambda.amazonaws.com')
    expect(
      request.mock.calls.find(([, m]) => m === 'putBucketPolicy'),
    ).toBeUndefined()
  })

  it('does not warn when the custom bucket policy already grants Lambda read access', async () => {
    log.warning.mockClear()
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketVersioning') return { Status: 'Enabled' }
      if (method === 'getBucketPolicy')
        return {
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              // Denied grant with the right principal/action — must not count.
              {
                Effect: 'Deny',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: ['s3:GetObject'],
              },
              // The actual grant.
              {
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: ['s3:GetObject', 's3:GetObjectVersion'],
              },
            ],
          }),
        }
      return {}
    })
    const ctx = buildCtx({
      customBucketName: 'my-bucket',
      requestImpl: request,
    })
    await ctx.ensureReferenceCodeStoragePrereqs()
    expect(log.warning).not.toHaveBeenCalled()
  })

  it('wraps a non-array Statement into an array before appending, on the global bucket', async () => {
    const existingSingleStatement = {
      Version: '2012-10-17',
      Statement: { Sid: 'SomethingElse', Effect: 'Allow' },
    }
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketPolicy')
        return { Policy: JSON.stringify(existingSingleStatement) }
      return {}
    })
    const ctx = buildCtx({ globalBucketUsed: true, requestImpl: request })
    await ctx.ensureReferenceCodeStoragePrereqs()
    const putCall = request.mock.calls.find(([, m]) => m === 'putBucketPolicy')
    expect(putCall).toBeDefined()
    const policy = JSON.parse(putCall[2].Policy)
    expect(Array.isArray(policy.Statement)).toBe(true)
    expect(policy.Statement).toHaveLength(2)
    expect(policy.Statement[0]).toEqual({
      Sid: 'SomethingElse',
      Effect: 'Allow',
    })
    expect(
      policy.Statement.find(
        (s) => s.Sid === 'ServerlessLambdaSelfManagedCodeAccess',
      ),
    ).toBeDefined()
  })

  it('stays silent when it cannot read the custom bucket policy', async () => {
    const request = jest.fn(async (service, method) => {
      if (method === 'getBucketVersioning') return { Status: 'Enabled' }
      if (method === 'getBucketPolicy') {
        const err = new Error('Access Denied')
        err.code = 'AWS_S3_GET_BUCKET_POLICY_ACCESS_DENIED'
        err.providerError = { code: 'AccessDenied' }
        throw err
      }
      return {}
    })
    const ctx = buildCtx({
      customBucketName: 'my-bucket',
      requestImpl: request,
    })
    await expect(
      ctx.ensureReferenceCodeStoragePrereqs(),
    ).resolves.toBeUndefined()
  })
})
