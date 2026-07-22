import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: Object.assign(jest.fn(), {
    notice: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  }),
  progress: { get: () => ({ notice: jest.fn() }) },
  style: { aside: (s) => s },
}))

const { log } = await import('@serverless/util')
const AwsRollbackFunction = (
  await import('../../../../../lib/plugins/aws/rollback-function.js')
).default

describe('AwsRollbackFunction', () => {
  let plugin
  let requestMock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const buildPlugin = (getFunctionResponse) => {
    requestMock = jest.fn(async (service, method) => {
      if (method === 'getFunction') return getFunctionResponse
      return {}
    })
    const serverless = {
      getProvider: () => ({ request: requestMock }),
      service: {
        getFunction: () => ({ name: 'svc-dev-hello' }),
      },
      pluginManager: { commandRunStartTime: Date.now() },
    }
    plugin = new AwsRollbackFunction(serverless, {
      function: 'hello',
      'function-version': '3',
    })
    plugin.validate = jest.fn()
    return plugin
  }

  it('rolls back a reference-mode version by repointing S3 coordinates', async () => {
    buildPlugin({
      Code: {
        ResolvedS3Object: {
          S3Bucket: 'bucket',
          S3Key: 'serverless/svc/dev/123/svc.zip',
          S3ObjectVersion: 'pinnedVersion',
        },
      },
    })
    await plugin.hooks['rollback:function:rollback']()

    // getFunction always goes through the v3 SDK path (mode is detected
    // from the response, and v2 silently drops Code.ResolvedS3Object).
    const getFunctionCall = requestMock.mock.calls.find(
      ([, m]) => m === 'getFunction',
    )
    expect(getFunctionCall[3]).toEqual({ sdkVersion: 3 })

    const updateCall = requestMock.mock.calls.find(
      ([, m]) => m === 'updateFunctionCode',
    )
    expect(updateCall[2]).toMatchObject({
      FunctionName: 'svc-dev-hello',
      S3Bucket: 'bucket',
      S3Key: 'serverless/svc/dev/123/svc.zip',
      S3ObjectVersion: 'pinnedVersion',
      S3ObjectStorageMode: 'REFERENCE',
    })
    expect(updateCall[2].ZipFile).toBeUndefined()
    // Reference mode's params are unknown to the v2 SDK's Lambda model, so
    // this call must also opt into the v3 SDK path.
    expect(updateCall[3]).toEqual({ sdkVersion: 3 })

    expect(log.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully rolled back function hello'),
    )
  })

  it('rolls back a copy-mode version via download and ZipFile', async () => {
    global.fetch = jest.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    }))
    buildPlugin({ Code: { Location: 'https://presigned.example/code' } })
    await plugin.hooks['rollback:function:rollback']()
    expect(global.fetch).toHaveBeenCalledWith('https://presigned.example/code')

    // getFunction always goes through the v3 SDK path, even for functions
    // that turn out to be in copy mode (mode is only known after the call).
    const getFunctionCall = requestMock.mock.calls.find(
      ([, m]) => m === 'getFunction',
    )
    expect(getFunctionCall[3]).toEqual({ sdkVersion: 3 })

    const updateCall = requestMock.mock.calls.find(
      ([, m]) => m === 'updateFunctionCode',
    )
    expect(updateCall[2].ZipFile).toBeInstanceOf(Buffer)
    expect(updateCall[2].S3ObjectStorageMode).toBeUndefined()
    // Copy mode keeps the default v2 SDK path: no 4th options argument.
    expect(updateCall[3]).toBeUndefined()

    expect(log.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully rolled back function hello'),
    )
  })

  it('raises AWS_FUNCTION_NOT_FOUND when the target version does not exist, regardless of mode', async () => {
    requestMock = jest.fn(async (service, method) => {
      if (method === 'getFunction') {
        // Message deliberately avoids the "not found" phrase so this test
        // exercises the providerError.code fallback, not the message match.
        const err = new Error('The resource you requested does not exist.')
        err.providerError = { code: 'ResourceNotFoundException' }
        throw err
      }
      return {}
    })
    const serverless = {
      getProvider: () => ({ request: requestMock }),
      service: { getFunction: () => ({ name: 'svc-dev-hello' }) },
      pluginManager: { commandRunStartTime: Date.now() },
    }
    plugin = new AwsRollbackFunction(serverless, {
      function: 'hello',
      'function-version': '3',
    })
    plugin.validate = jest.fn()

    await expect(
      plugin.hooks['rollback:function:rollback'](),
    ).rejects.toMatchObject({ code: 'AWS_FUNCTION_NOT_FOUND' })
  })

  it('wraps any other getFunction failure as AWS_FUNCTION_NOT_ACCESIBLE', async () => {
    requestMock = jest.fn(async (service, method) => {
      if (method === 'getFunction') {
        throw new Error('Access Denied')
      }
      return {}
    })
    const serverless = {
      getProvider: () => ({ request: requestMock }),
      service: { getFunction: () => ({ name: 'svc-dev-hello' }) },
      pluginManager: { commandRunStartTime: Date.now() },
    }
    plugin = new AwsRollbackFunction(serverless, {
      function: 'hello',
      'function-version': '3',
    })
    plugin.validate = jest.fn()

    await expect(
      plugin.hooks['rollback:function:rollback'](),
    ).rejects.toMatchObject({ code: 'AWS_FUNCTION_NOT_ACCESIBLE' })
  })
})
