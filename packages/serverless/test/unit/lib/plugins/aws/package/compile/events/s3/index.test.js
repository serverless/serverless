import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
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

// Mock custom-resources module
const addCustomResourceToServiceMock = jest.fn().mockResolvedValue()
jest.unstable_mockModule(
  '../../../../../../../../../lib/plugins/aws/custom-resources/index.js',
  () => ({
    addCustomResourceToService: addCustomResourceToServiceMock,
  }),
)

// Import after mocking
const { default: AwsCompileS3Events } = await import(
  '../../../../../../../../../lib/plugins/aws/package/compile/events/s3/index.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../../lib/serverless.js'
)

describe('AwsCompileS3Events', () => {
  let serverless
  let awsCompileS3Events

  beforeEach(() => {
    addCustomResourceToServiceMock.mockClear()
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileS3Events = new AwsCompileS3Events(serverless, options)
    awsCompileS3Events.serverless.service.service = 'new-service'
    awsCompileS3Events.serverless.configSchemaHandler = {
      schema: {
        definitions: {
          awsS3BucketName: {
            pattern: '',
          },
        },
      },
    }
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileS3Events.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#newS3Buckets()', () => {
    it('should create corresponding resources when S3 events are given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-two',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'subfolder/' }],
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.S3BucketFirstfunctionbucketone.Type).toBe(
        'AWS::S3::Bucket',
      )
      expect(resources.S3BucketFirstfunctionbuckettwo.Type).toBe(
        'AWS::S3::Bucket',
      )
      expect(resources.FirstLambdaPermissionFirstfunctionbucketoneS3.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.FirstLambdaPermissionFirstfunctionbuckettwoS3.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.S3BucketFirstfunctionbuckettwo.Properties
          .NotificationConfiguration.LambdaConfigurations[0].Filter,
      ).toEqual({
        S3Key: { Rules: [{ Name: 'prefix', Value: 'subfolder/' }] },
      })
    })

    it('should create single bucket resource when the same bucket referenced repeatedly', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-one',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'subfolder/' }],
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(resources.S3BucketFirstfunctionbucketone.Type).toBe(
        'AWS::S3::Bucket',
      )
      expect(
        resources.S3BucketFirstfunctionbucketone.Properties
          .NotificationConfiguration.LambdaConfigurations.length,
      ).toBe(2)
    })

    it('should use s3:ObjectCreated:* as the default event', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(
        resources.S3BucketFirstfunctionbucketone.Properties
          .NotificationConfiguration.LambdaConfigurations[0].Event,
      ).toBe('s3:ObjectCreated:*')
    })

    it('should allow custom event types to be configured', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket-one',
                event: 's3:ObjectRemoved:*',
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(
        resources.S3BucketFirstfunctionbucketone.Properties
          .NotificationConfiguration.LambdaConfigurations[0].Event,
      ).toBe('s3:ObjectRemoved:*')
    })

    it('should support suffix rules', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket-one',
                rules: [{ suffix: '.jpg' }],
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(
        resources.S3BucketFirstfunctionbucketone.Properties
          .NotificationConfiguration.LambdaConfigurations[0].Filter,
      ).toEqual({
        S3Key: { Rules: [{ Name: 'suffix', Value: '.jpg' }] },
      })
    })

    it('should set the correct lambda permission principal', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(
        resources.FirstLambdaPermissionFirstfunctionbucketoneS3.Properties
          .Principal,
      ).toBe('s3.amazonaws.com')
    })

    it('should not create S3 bucket resources for existing buckets', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'existing-bucket',
                existing: true,
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(Object.keys(resources).length).toBe(0)
    })

    it('should throw error when bucket is object without existing flag', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: { Ref: 'SomeBucket' },
              },
            },
          ],
        },
      }

      expect(() => awsCompileS3Events.newS3Buckets()).toThrow(/existing: true/)
    })
  })

  describe('#existingS3Buckets()', () => {
    it('should create custom resource for existing S3 bucket', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-bucket',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })

    it('should support bucket as CloudFormation intrinsic function', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: { Ref: 'SomeBucket' },
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })

    it('should support forceDeploy option', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-bucket',
                existing: true,
                forceDeploy: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })

    it('should support event filter rules with existing buckets', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-bucket',
                existing: true,
                event: 's3:ObjectCreated:*',
                rules: [{ prefix: 'uploads/' }, { suffix: '.jpg' }],
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      expect(addCustomResourceToServiceMock).toHaveBeenCalled()
    })
  })

  describe('#newS3Buckets() - additional tests', () => {
    it('should not create corresponding resources when S3 events are not given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      expect(Object.keys(resources).length).toBe(0)
    })

    it('should add the permission resource logical id to the bucket DependsOn array', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.S3BucketFirstfunctionbucketone.DependsOn).toBeDefined()
      expect(resources.S3BucketFirstfunctionbucketone.DependsOn).toContain(
        'FirstLambdaPermissionFirstfunctionbucketoneS3',
      )
    })

    it('should support multiple prefix and suffix rules', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'first-function-bucket-one',
                rules: [{ prefix: 'uploads/' }, { suffix: '.jpg' }],
              },
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const filter =
        resources.S3BucketFirstfunctionbucketone.Properties
          .NotificationConfiguration.LambdaConfigurations[0].Filter

      expect(filter.S3Key.Rules).toHaveLength(2)
      expect(filter.S3Key.Rules).toContainEqual({
        Name: 'prefix',
        Value: 'uploads/',
      })
      expect(filter.S3Key.Rules).toContainEqual({
        Name: 'suffix',
        Value: '.jpg',
      })
    })

    it('should create resources for multiple functions with different buckets', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-bucket',
            },
          ],
        },
        second: {
          events: [
            {
              s3: 'second-bucket',
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.S3BucketFirstbucket.Type).toBe('AWS::S3::Bucket')
      expect(resources.S3BucketSecondbucket.Type).toBe('AWS::S3::Bucket')
    })

    it('should not throw error when other events are present', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'get',
                path: '/',
              },
            },
          ],
        },
      }

      expect(() => awsCompileS3Events.newS3Buckets()).not.toThrow()
    })

    it('should create lambda permission with correct SourceArn', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'test-bucket',
            },
          ],
        },
      }

      awsCompileS3Events.newS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permission = resources.FirstLambdaPermissionTestbucketS3
      expect(permission.Properties.SourceArn).toBeDefined()
    })
  })

  describe('#existingS3Buckets()', () => {
    it('should support forceDeploy setting', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                forceDeploy: true,
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the Custom::S3 resource
      const customS3Resource = Object.values(resources).find(
        (r) => r.Type === 'Custom::S3',
      )

      expect(customS3Resource).toBeDefined()
      // ForceDeploy should be a number (timestamp)
      expect(typeof customS3Resource.Properties.ForceDeploy).toBe('number')
    })

    it('should support multiple event definitions on existing bucket', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRemoved:Delete',
                rules: [{ prefix: 'downloads' }, { suffix: '.txt' }],
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the Custom::S3 resource
      const customS3Resource = Object.values(resources).find(
        (r) => r.Type === 'Custom::S3',
      )

      expect(customS3Resource).toBeDefined()
      // Should have multiple bucket configurations
      expect(customS3Resource.Properties.BucketConfigs).toHaveLength(2)
    })

    it('should throw error for multiple different buckets per function with CF references', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: { Ref: 'SomeBucket' },
                event: 's3:ObjectCreated:*',
                existing: true,
              },
            },
            {
              s3: {
                bucket: { Ref: 'AnotherBucket' },
                event: 's3:ObjectCreated:*',
                existing: true,
              },
            },
          ],
        },
      }

      // The method throws synchronously (not a rejected promise)
      expect(() => awsCompileS3Events.existingS3Buckets()).toThrow(
        /Only one S3 Bucket can be configured per function/,
      )
    })

    it('should support CF Ref for bucket', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: { Ref: 'SomeBucket' },
                event: 's3:ObjectCreated:*',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the Custom::S3 resource
      const customS3Resource = Object.values(resources).find(
        (r) => r.Type === 'Custom::S3',
      )

      expect(customS3Resource).toBeDefined()
      expect(customS3Resource.Properties.BucketName).toEqual({
        Ref: 'SomeBucket',
      })
    })

    it('should support CF Fn::If for bucket', async () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: {
                  'Fn::If': [
                    'isFirstBucketEmpty',
                    { Ref: 'FirstBucket' },
                    { Ref: 'SecondBucket' },
                  ],
                },
                event: 's3:ObjectCreated:*',
                existing: true,
              },
            },
          ],
        },
      }

      await awsCompileS3Events.existingS3Buckets()

      const resources =
        awsCompileS3Events.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the Custom::S3 resource
      const customS3Resource = Object.values(resources).find(
        (r) => r.Type === 'Custom::S3',
      )

      expect(customS3Resource).toBeDefined()
      expect(customS3Resource.Properties.BucketName).toEqual({
        'Fn::If': [
          'isFirstBucketEmpty',
          { Ref: 'FirstBucket' },
          { Ref: 'SecondBucket' },
        ],
      })
    })
  })
})
