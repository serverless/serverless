import { jest } from '@jest/globals'
import { createRequire } from 'module'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

const require = createRequire(import.meta.url)

// Mock AWS Request
const mockAwsRequest = jest.fn()
const mockAwsRequestMemoized = jest.fn()
mockAwsRequest.memoized = mockAwsRequestMemoized

jest.unstable_mockModule('../../../../../lib/aws/request.js', () => ({
  __esModule: true,
  default: mockAwsRequest,
}))

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

// Import Class Under Test (Dynamic)
const { default: AwsProvider } =
  await import('../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } = await import('../../../../../lib/serverless.js')

describe('AwsProvider', () => {
  let awsProvider
  let serverless
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  }

  beforeEach(() => {
    // Reset mocks
    mockAwsRequest.mockReset()
    mockAwsRequestMemoized.mockReset()
    mockAwsRequest.memoized = mockAwsRequestMemoized

    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = {
      log: jest.fn(),
    }
    serverless.credentialProviders = {
      aws: {
        getCredentials: jest.fn(),
      },
    }
    awsProvider = new AwsProvider(serverless, options)
  })

  describe('#constructor()', () => {
    it('should set Serverless instance', () => {
      expect(typeof awsProvider.serverless).not.toBe('undefined')
    })

    it('should set the provider property', () => {
      expect(awsProvider.provider).toBe(awsProvider)
    })

    describe('deploymentBucket configuration', () => {
      it('should do nothing if not defined', () => {
        serverless.service.provider.deploymentBucket = undefined
        const newAwsProvider = new AwsProvider(serverless, options)
        expect(
          newAwsProvider.serverless.service.provider.deploymentBucket,
        ).toBe(undefined)
      })

      it('should do nothing if the value is a string', () => {
        serverless.service.provider.deploymentBucket = 'my.deployment.bucket'
        const newAwsProvider = new AwsProvider(serverless, options)
        expect(
          newAwsProvider.serverless.service.provider.deploymentBucket,
        ).toBe('my.deployment.bucket')
      })
    })
  })

  describe('#request()', () => {
    beforeEach(() => {
      // Mock getCredentials to return fixed credentials
      jest.spyOn(awsProvider, 'getCredentials').mockResolvedValue({
        accessKeyId: 'AKIA...',
        secretAccessKey: 'SECRET...',
        sessionToken: 'TOKEN...',
        region: 'us-east-1',
      })
    })

    it('should call awsRequest with merged credentials and region', async () => {
      await awsProvider.request('S3', 'getObject', { Bucket: 'b' })

      expect(mockAwsRequest).toHaveBeenCalledTimes(1)
      const args = mockAwsRequest.mock.calls[0]
      expect(args[0]).toEqual(
        expect.objectContaining({
          name: 'S3',
          params: expect.objectContaining({
            accessKeyId: 'AKIA...',
            region: 'us-east-1',
          }),
        }),
      )
      expect(args[1]).toBe('getObject')
      expect(args[2]).toEqual({ Bucket: 'b' })
    })

    it('should use memoized request if useCache is true', async () => {
      await awsProvider.request('S3', 'getObject', {}, { useCache: true })
      expect(mockAwsRequestMemoized).toHaveBeenCalledTimes(1)
      expect(mockAwsRequest).not.toHaveBeenCalled()
    })
  })

  describe('#getCredentials()', () => {
    // Note: getCredentials uses `resolveCredentials` which is complex and uses the chain.
    // In unit tests, we often Mock `resolveCredentials` or the properties it relies on.
    // However, verifying the behavior of `resolveCredentials` is important.
    // It might rely on `this.serverless.credentialProviders.aws.getCredentials` in v4?
    // Let's check if we can verify the profile logic.

    // In v4, provider.js: `const creds = await this.resolveCredentials()`
    // `resolveCredentials` seems to be internal or inherited?
    // Actually `AwsProvider` might not have it defined in the snippet I saw?
    // Checking the file view... `AwsProvider` definition was huge.
    // Assuming it's implemented.

    it('should return credentials object structure', async () => {
      // Mock resolveCredentials if it exists on prototype, or check if it calls parent?
      // If `resolveCredentials` is not on AwsProvider, it might be on a superclass or resolved dynamically?
      // The snippet showed `async getCredentials() { const creds = await this.resolveCredentials() ... }`
      // So `resolveCredentials` must be a method.
      // We can spy on it to test `getCredentials` mapping.

      const mockCreds = {
        accessKeyId: 'AK',
        secretAccessKey: 'SK',
        sessionToken: 'ST',
        accountId: '123',
        callerUserId: 'u',
        callerArn: 'arn',
      }
      awsProvider.resolveCredentials = jest.fn().mockResolvedValue(mockCreds)

      const result = await awsProvider.getCredentials()
      expect(result).toEqual(mockCreds)
    })
  })

  describe('#getAccountInfo()', () => {
    it('should call STS getCallerIdentity', async () => {
      mockAwsRequest.mockResolvedValue({
        Account: '123456789012',
        Arn: 'arn:aws:iam::123456789012:user/test',
        UserId: 'AKIA...',
      })
      // Mock getCredentials to avoid lookup
      jest.spyOn(awsProvider, 'getCredentials').mockResolvedValue({})

      const info = await awsProvider.getAccountInfo()

      expect(mockAwsRequest).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'STS' }),
        'getCallerIdentity',
        {},
      )
      expect(info.accountId).toBe('123456789012')
      expect(info.partition).toBe('aws')
    })
  })

  describe('#getAccountId()', () => {
    it('should return the AWS account id', async () => {
      const accountId = '12345678'
      mockAwsRequest.mockResolvedValue({
        Account: accountId,
        Arn: 'arn:aws:sts::12345678:assumed-role/ROLE-NAME/VWXYZ',
        UserId: 'ABCDEFGHIJKLMNOPQRSTU:VWXYZ',
      })
      // Mock getCredentials to avoid lookup
      jest.spyOn(awsProvider, 'getCredentials').mockResolvedValue({})

      const result = await awsProvider.getAccountId()

      expect(mockAwsRequest).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'STS' }),
        'getCallerIdentity',
        {},
      )
      expect(result).toBe(accountId)
    })
  })

  describe('#getServerlessDeploymentBucketName()', () => {
    it('should return custom bucket if defined', async () => {
      awsProvider.serverless.service.provider.deploymentBucket = 'custom-bucket'
      const bucket = await awsProvider.getServerlessDeploymentBucketName()
      expect(bucket).toBe('custom-bucket')
    })

    it('should query CloudFormation if no custom bucket', async () => {
      awsProvider.serverless.service.provider.deploymentBucket = null
      awsProvider.naming = {
        getStackName: () => 'stack-name',
        getDeploymentBucketLogicalId: () => 'ServerlessDeploymentBucket',
      }

      mockAwsRequest.mockResolvedValue({
        StackResourceDetail: {
          PhysicalResourceId: 'cf-bucket-name',
        },
      })
      // Mock getCredentials
      jest.spyOn(awsProvider, 'getCredentials').mockResolvedValue({})

      const bucket = await awsProvider.getServerlessDeploymentBucketName()

      expect(bucket).toBe('cf-bucket-name')
      expect(mockAwsRequest).toHaveBeenCalledWith(
        expect.anything(),
        'describeStackResource',
        {
          StackName: 'stack-name',
          LogicalResourceId: 'ServerlessDeploymentBucket',
        },
      )
    })
  })

  describe('values', () => {
    const obj = {
      a: 'b',
      c: {
        d: 'e',
        f: {
          g: 'h',
        },
      },
    }
    const paths = [['a'], ['c', 'd'], ['c', 'f', 'g']]
    const getExpected = [
      { path: paths[0], value: obj.a },
      { path: paths[1], value: obj.c.d },
      { path: paths[2], value: obj.c.f.g },
    ]
    describe('#getValues', () => {
      it('should return an array of values given paths to them', () => {
        expect(awsProvider.getValues(obj, paths)).toEqual(getExpected)
      })
    })
    describe('#firstValue', () => {
      it("should ignore entries without a 'value' attribute", () => {
        const input = JSON.parse(JSON.stringify(getExpected))
        delete input[0].value
        delete input[2].value
        expect(awsProvider.firstValue(input)).toEqual(getExpected[1])
      })

      it("should ignore entries with an undefined 'value' attribute", () => {
        const input = JSON.parse(JSON.stringify(getExpected))
        input[0].value = undefined
        input[2].value = undefined
        expect(awsProvider.firstValue(input)).toEqual(getExpected[1])
      })

      it('should return the first value', () => {
        expect(awsProvider.firstValue(getExpected)).toEqual(getExpected[0])
      })

      it('should return the middle value', () => {
        const input = JSON.parse(JSON.stringify(getExpected))
        delete input[0].value
        delete input[2].value
        expect(awsProvider.firstValue(input)).toEqual(input[1])
      })

      it('should return the last value', () => {
        const input = JSON.parse(JSON.stringify(getExpected))
        delete input[0].value
        delete input[1].value
        expect(awsProvider.firstValue(input)).toEqual(input[2])
      })

      it('should return the last object if none have valid values', () => {
        const input = JSON.parse(JSON.stringify(getExpected))
        delete input[0].value
        delete input[1].value
        delete input[2].value
        expect(awsProvider.firstValue(input)).toEqual(input[2])
      })
    })
  })

  describe('#getRegion()', () => {
    it('should default to "us-east-1"', () => {
      expect(awsProvider.getRegion()).toBe('us-east-1')
    })

    it('should allow to override via `provider.region`', () => {
      serverless.service.provider.region = 'eu-central-1'
      const newAwsProvider = new AwsProvider(serverless, {})
      expect(newAwsProvider.getRegion()).toBe('eu-central-1')
    })

    it('should allow to override via CLI `--region` param', () => {
      const newOptions = { ...options, region: 'us-west-1' }
      const newAwsProvider = new AwsProvider(serverless, newOptions)
      expect(newAwsProvider.getRegion()).toBe('us-west-1')
    })
  })

  describe('#getStage()', () => {
    it('should default to "dev"', () => {
      expect(awsProvider.getStage()).toBe('dev')
    })

    it('should allow to override via `provider.stage`', () => {
      serverless.service.provider.stage = 'staging'
      // Pass empty options ensuring no CLI override
      const newAwsProvider = new AwsProvider(serverless, {})
      expect(newAwsProvider.getStage()).toBe('staging')
    })

    it('should allow to override via CLI `--stage` param', () => {
      const newOptions = { ...options, stage: 'production' }
      const newAwsProvider = new AwsProvider(serverless, newOptions)
      expect(newAwsProvider.getStage()).toBe('production')
    })
  })

  describe('#getDeploymentPrefix()', () => {
    it('should default to "serverless"', () => {
      expect(awsProvider.getDeploymentPrefix()).toBe('serverless')
    })

    it('should allow to override via `provider.deploymentPrefix`', () => {
      awsProvider.serverless.service.provider.deploymentPrefix = 'custom'
      expect(awsProvider.getDeploymentPrefix()).toBe('custom')
    })
  })

  describe('#getProfile()', () => {
    it('should return undefined if no profile set', () => {
      // sf-core returns undefined when no profile is set
      expect(awsProvider.getProfile()).toBeUndefined()
    })

    it('should return profile from options', () => {
      awsProvider.options['aws-profile'] = 'options-profile'
      expect(awsProvider.getProfile()).toBe('options-profile')
    })

    it('should return profile from provider config', () => {
      // Create a fresh provider without the aws-profile option from previous test
      const newServerless = new Serverless({ commands: [], options: {} })
      newServerless.cli = { log: jest.fn() }
      newServerless.credentialProviders = { aws: { getCredentials: jest.fn() } }
      newServerless.service.provider.profile = 'provider-profile'
      const newAwsProvider = new AwsProvider(newServerless, {})
      expect(newAwsProvider.getProfile()).toBe('provider-profile')
    })
  })

  describe('S3 Transfer Acceleration', () => {
    describe('#isS3TransferAccelerationEnabled()', () => {
      it('should return false by default', () => {
        awsProvider.options['aws-s3-accelerate'] = undefined
        expect(awsProvider.isS3TransferAccelerationEnabled()).toBe(false)
      })

      it('should return true when CLI option is provided', () => {
        awsProvider.options['aws-s3-accelerate'] = true
        expect(awsProvider.isS3TransferAccelerationEnabled()).toBe(true)
      })
    })

    describe('#isS3TransferAccelerationDisabled()', () => {
      it('should be enabled by default (not disabled)', () => {
        expect(awsProvider.isS3TransferAccelerationDisabled()).toBe(false)
      })

      it('should be disabled if options flag is false', () => {
        awsProvider.options['aws-s3-accelerate'] = false
        expect(awsProvider.isS3TransferAccelerationDisabled()).toBe(true)
      })
    })

    describe('#disableTransferAccelerationForCurrentDeploy()', () => {
      it('should remove the corresponding option for the current deploy', () => {
        awsProvider.options['aws-s3-accelerate'] = true
        expect(awsProvider.options['aws-s3-accelerate']).toBe(true)
        awsProvider.disableTransferAccelerationForCurrentDeploy()
        expect(awsProvider.options['aws-s3-accelerate']).toBeUndefined()
      })
    })
  })

  describe('#resolveFunctionArn()', () => {
    it('should return ARN if input is ARN', () => {
      const arn = 'arn:aws:lambda:us-east-1:123:function:foo'
      expect(awsProvider.resolveFunctionArn(arn)).toBe(arn)
    })

    it('should return Fn::GetAtt for function name', () => {
      awsProvider.serverless.service.functions = {
        foo: { name: 'foo-func' },
      }
      awsProvider.naming = { getLambdaLogicalId: () => 'FooLambdaFunction' }

      // Mock map object for getFunction
      awsProvider.serverless.service.getFunction = (name) =>
        awsProvider.serverless.service.functions[name]

      const result = awsProvider.resolveFunctionArn('foo')
      expect(result).toEqual({ 'Fn::GetAtt': ['FooLambdaFunction', 'Arn'] })
    })

    it('should throw error for unrecognized function', () => {
      awsProvider.serverless.service.getFunction = () => null
      expect(() => awsProvider.resolveFunctionArn('bar')).toThrow(
        expect.any(Error),
      )
    })
  })
})
