import { jest } from '@jest/globals'
import { createRequire } from 'module'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

const require = createRequire(import.meta.url)

// Mock AWS Request (v2 path)
const mockAwsRequest = jest.fn()
const mockAwsRequestMemoized = jest.fn()
mockAwsRequest.memoized = mockAwsRequestMemoized

jest.unstable_mockModule('../../../../../lib/aws/request.js', () => ({
  __esModule: true,
  default: mockAwsRequest,
}))

// Mock AWS Request (v3 path)
const mockV3Request = jest.fn()
const mockV3RequestMemoized = jest.fn()
mockV3Request.memoized = mockV3RequestMemoized

jest.unstable_mockModule('../../../../../lib/aws/v3/request.js', () => ({
  __esModule: true,
  default: mockV3Request,
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
    mockV3Request.mockReset()
    mockV3RequestMemoized.mockReset()
    mockV3Request.memoized = mockV3RequestMemoized

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

    it('should route to v3Request when sdkVersion is 3', async () => {
      await awsProvider.request(
        'LambdaMicrovms',
        'listManagedMicrovmImageVersions',
        {
          ImageIdentifier:
            'arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1',
        },
        { sdkVersion: 3 },
      )
      expect(mockV3Request).toHaveBeenCalledTimes(1)
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

  describe('#getOrCreateEcrRepository()', () => {
    const repositoryName = 'serverless-test-dev'
    const repositoryUri = `123456789012.dkr.ecr.us-east-1.amazonaws.com/${repositoryName}`

    beforeEach(() => {
      jest.spyOn(awsProvider, 'getCredentials').mockResolvedValue({})
      jest.spyOn(awsProvider, 'getAccountId').mockResolvedValue('123456789012')
      awsProvider.naming = { getEcrRepositoryName: () => repositoryName }
    })

    const mockEcrResponses = ({ describeFails = false } = {}) => {
      mockAwsRequest.mockImplementation((_params, method) => {
        if (method === 'describeRepositories') {
          if (describeFails) {
            const err = new Error('RepositoryNotFoundException')
            err.providerError = { code: 'RepositoryNotFoundException' }
            return Promise.reject(err)
          }
          return Promise.resolve({ repositories: [{ repositoryUri }] })
        }
        if (method === 'createRepository') {
          return Promise.resolve({ repository: { repositoryUri } })
        }
        if (method === 'putLifecyclePolicy') {
          return Promise.resolve({})
        }
        return Promise.resolve({})
      })
    }

    it('should not call putLifecyclePolicy when maxImages is not set', async () => {
      mockEcrResponses()

      const result = await awsProvider.getOrCreateEcrRepository(false)

      expect(result).toEqual({ repositoryUri, repositoryName })
      const putCalls = mockAwsRequest.mock.calls.filter(
        ([, method]) => method === 'putLifecyclePolicy',
      )
      expect(putCalls).toHaveLength(0)
    })

    it('should call putLifecyclePolicy on an existing repo when maxImages is set', async () => {
      mockEcrResponses()

      await awsProvider.getOrCreateEcrRepository(false, 10)

      const putCall = mockAwsRequest.mock.calls.find(
        ([, method]) => method === 'putLifecyclePolicy',
      )
      expect(putCall).toBeDefined()
      const params = putCall[2]
      expect(params.repositoryName).toBe(repositoryName)
      expect(JSON.parse(params.lifecyclePolicyText)).toEqual({
        rules: [
          {
            rulePriority: 1000,
            description:
              'Expire superseded image versions (provider.ecr.maxImages)',
            selection: {
              tagStatus: 'untagged',
              countType: 'imageCountMoreThan',
              countNumber: 10,
            },
            action: { type: 'expire' },
          },
        ],
      })
    })

    it('should create the repo and apply the lifecycle policy when maxImages is set on a fresh repo', async () => {
      mockEcrResponses({ describeFails: true })

      await awsProvider.getOrCreateEcrRepository(true, 5)

      const methods = mockAwsRequest.mock.calls.map(([, method]) => method)
      expect(methods).toContain('createRepository')
      const putCall = mockAwsRequest.mock.calls.find(
        ([, method]) => method === 'putLifecyclePolicy',
      )
      expect(putCall).toBeDefined()
      const policy = JSON.parse(putCall[2].lifecyclePolicyText)
      expect(policy.rules[0].selection.countNumber).toBe(5)
    })
  })

  describe('logGroupClass schema', () => {
    let schemaServerless

    beforeEach(() => {
      schemaServerless = new Serverless({ commands: [], options: {} })
      schemaServerless.credentialProviders = {
        aws: { getCredentials: jest.fn() },
      }
      schemaServerless.service.provider.name = 'aws'
      new AwsProvider(schemaServerless, options)
    })

    it('defines awsLogGroupClass with a single case-insensitive regex covering both values', () => {
      const def =
        schemaServerless.configSchemaHandler.schema.definitions.awsLogGroupClass
      expect(def).toBeDefined()
      expect(def.type).toBe('string')
      expect(def.regexp).toBe('/^(STANDARD|INFREQUENT_ACCESS)$/i')
    })

    it('exposes logGroupClass on awsLambdaLoggingConfiguration as a reference', () => {
      const props =
        schemaServerless.configSchemaHandler.schema.definitions
          .awsLambdaLoggingConfiguration.properties
      expect(props.logGroupClass).toBeDefined()
      expect(props.logGroupClass.$ref).toBe('#/definitions/awsLogGroupClass')
    })
  })

  describe('#getLogGroupClass()', () => {
    it('returns function-level logGroupClass when set', () => {
      const fn = { logs: { logGroupClass: 'INFREQUENT_ACCESS' } }
      expect(awsProvider.getLogGroupClass(fn)).toBe('INFREQUENT_ACCESS')
    })

    it('falls back to provider.logs.lambda.logGroupClass when function level is unset', () => {
      serverless.service.provider.logs = {
        lambda: { logGroupClass: 'INFREQUENT_ACCESS' },
      }
      expect(awsProvider.getLogGroupClass({})).toBe('INFREQUENT_ACCESS')
    })

    it('function-level value wins over provider-level value', () => {
      serverless.service.provider.logs = {
        lambda: { logGroupClass: 'INFREQUENT_ACCESS' },
      }
      const fn = { logs: { logGroupClass: 'STANDARD' } }
      expect(awsProvider.getLogGroupClass(fn)).toBe('STANDARD')
    })

    it('returns undefined when no logGroupClass is set anywhere', () => {
      expect(awsProvider.getLogGroupClass({})).toBeUndefined()
    })

    it('normalizes a lowercase function-level value to canonical uppercase', () => {
      const fn = { logs: { logGroupClass: 'infrequent_access' } }
      expect(awsProvider.getLogGroupClass(fn)).toBe('INFREQUENT_ACCESS')
    })

    it('normalizes a mixed-case provider-level value to canonical uppercase', () => {
      serverless.service.provider.logs = {
        lambda: { logGroupClass: 'Infrequent_Access' },
      }
      expect(awsProvider.getLogGroupClass({})).toBe('INFREQUENT_ACCESS')
    })

    it('normalizes STANDARD identically regardless of input case', () => {
      const fn = { logs: { logGroupClass: 'standard' } }
      expect(awsProvider.getLogGroupClass(fn)).toBe('STANDARD')
    })
  })

  describe('logGroupClass schema (case-insensitive)', () => {
    let schemaServerless

    beforeEach(() => {
      schemaServerless = new Serverless({ commands: [], options: {} })
      schemaServerless.credentialProviders = {
        aws: { getCredentials: jest.fn() },
      }
      schemaServerless.service.provider.name = 'aws'
      new AwsProvider(schemaServerless, options)
    })

    it('accepts lowercase, mixed-case, and uppercase values for awsLogGroupClass', async () => {
      const Ajv = (await import('ajv')).default
      const { default: regexpKeyword } =
        await import('../../../../../lib/classes/config-schema-handler/regexp-keyword.js')
      const ajv = new Ajv({ allErrors: true, strict: false })
      ajv.addKeyword(regexpKeyword)
      const validate = ajv.compile(
        schemaServerless.configSchemaHandler.schema.definitions
          .awsLogGroupClass,
      )

      expect(validate('STANDARD')).toBe(true)
      expect(validate('standard')).toBe(true)
      expect(validate('INFREQUENT_ACCESS')).toBe(true)
      expect(validate('infrequent_access')).toBe(true)
      expect(validate('Infrequent_Access')).toBe(true)
      expect(validate('NOT_A_REAL_CLASS')).toBe(false)
    })

    it('produces an actionable error message for an invalid value', async () => {
      const Ajv = (await import('ajv')).default
      const { default: regexpKeyword } =
        await import('../../../../../lib/classes/config-schema-handler/regexp-keyword.js')
      const { default: normalizeAjvErrors } =
        await import('../../../../../lib/classes/config-schema-handler/normalize-ajv-errors.js')
      const ajv = new Ajv({
        allErrors: true,
        strict: false,
        verbose: true,
      })
      ajv.addKeyword(regexpKeyword)
      const validate = ajv.compile(
        schemaServerless.configSchemaHandler.schema.definitions
          .awsLogGroupClass,
      )

      validate('BUDGET')
      const messages = normalizeAjvErrors(validate.errors).map((e) => e.message)
      expect(messages).toEqual([expect.stringContaining(`value 'BUDGET'`)])
      expect(messages[0]).toContain('STANDARD')
      expect(messages[0]).toContain('INFREQUENT_ACCESS')
    })
  })
})
