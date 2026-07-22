import { describe, it, expect, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    warning: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn() })),
  },
}))

const checkForChangesMixin = (
  await import('../../../../../../../lib/plugins/aws/deploy/lib/check-for-changes.js')
).default

describe('getObjectMetadata', () => {
  const buildCtx = (requestImpl) => ({
    ...checkForChangesMixin,
    bucketName: 'my-bucket',
    provider: {
      request: requestImpl,
      naming: { getServiceStateFileName: () => 'serverless-state.json' },
    },
  })

  it('fetches non-state objects via headObject and preserves Key/Metadata', async () => {
    const request = jest.fn(async (service, method, params) => {
      expect(service).toBe('S3')
      expect(method).toBe('headObject')
      expect(params).toEqual({
        Bucket: 'my-bucket',
        Key: 'some/path/my-function.zip',
      })
      return { Metadata: { filesha256: 'abc123' } }
    })
    const ctx = buildCtx(request)

    const result = await ctx.getObjectMetadata([
      { Key: 'some/path/my-function.zip' },
    ])

    expect(request).toHaveBeenCalledTimes(1)
    expect(result[0].Key).toBe('some/path/my-function.zip')
    expect(result[0].Metadata.filesha256).toBe('abc123')
  })

  it('fetches the state-file object via getObject, preserves Key/Metadata, and populates previousDeploymentState from a Buffer body', async () => {
    const previousState = { service: { provider: { foo: 'bar' } } }
    const request = jest.fn(async (service, method, params) => {
      if (params.Key.endsWith('serverless-state.json')) {
        expect(method).toBe('getObject')
        return {
          Metadata: { filesha256: 'state-hash' },
          Body: Buffer.from(JSON.stringify(previousState)),
        }
      }
      expect(method).toBe('headObject')
      return { Metadata: { filesha256: 'zip-hash' } }
    })
    const ctx = buildCtx(request)

    const result = await ctx.getObjectMetadata([
      { Key: 'some/path/my-function.zip' },
      { Key: 'some/path/serverless-state.json' },
    ])

    const stateEntry = result.find((entry) =>
      entry.Key.endsWith('serverless-state.json'),
    )
    expect(stateEntry.Key).toBe('some/path/serverless-state.json')
    expect(stateEntry.Metadata.filesha256).toBe('state-hash')
    expect(ctx.previousDeploymentState).toEqual(previousState)
  })

  it('populates previousDeploymentState from a v3-style body exposing transformToString', async () => {
    const previousState = { service: { provider: { baz: 'qux' } } }
    const request = jest.fn(async () => ({
      Metadata: { filesha256: 'state-hash' },
      Body: {
        transformToString: async () => JSON.stringify(previousState),
      },
    }))
    const ctx = buildCtx(request)

    const result = await ctx.getObjectMetadata([
      { Key: 'some/path/serverless-state.json' },
    ])

    expect(result[0].Key).toBe('some/path/serverless-state.json')
    expect(ctx.previousDeploymentState).toEqual(previousState)
  })

  it('sets previousDeploymentState to null and does not throw when the body is unparseable', async () => {
    const request = jest.fn(async () => ({
      Metadata: { filesha256: 'state-hash' },
      Body: Buffer.from('not-json'),
    }))
    const ctx = buildCtx(request)

    let result
    await expect(
      (async () => {
        result = await ctx.getObjectMetadata([
          { Key: 'some/path/serverless-state.json' },
        ])
      })(),
    ).resolves.not.toThrow()

    expect(ctx.previousDeploymentState).toBeNull()
    expect(result[0].Key).toBe('some/path/serverless-state.json')
  })
})
