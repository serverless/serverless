import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
    notice: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn(), link: jest.fn((url) => url) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

// Import after mocking
const { default: AwsCompileCloudFrontEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/cloud-front.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileCloudFrontEvents', () => {
  let serverless
  let awsCompileCloudFrontEvents
  let options

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
    }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless.processedInput = {
      commands: [],
    }
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    }

    serverless.service.resources = {}
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        IamRoleLambdaExecution: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['lambda.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            },
            Policies: [
              {
                PolicyDocument: {
                  Statement: [],
                },
              },
            ],
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          DeletionPolicy: 'Retain',
          Properties: {
            FunctionName: {
              Ref: 'FirstLambdaFunction',
            },
          },
        },
      },
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileCloudFrontEvents = new AwsCompileCloudFrontEvents(
      serverless,
      options,
    )
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileCloudFrontEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileCloudFrontEvents()', () => {
    it('should create CloudFront distribution with S3 origin', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const resources =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.CloudFrontDistribution).toBeDefined()
      expect(resources.CloudFrontDistribution.Type).toBe(
        'AWS::CloudFront::Distribution',
      )
    })

    it('should correctly deep merge arrays with objects', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: {
                  DomainName: 'bucketname.s3.amazonaws.com',
                  OriginPath: '/app*',
                  S3OriginConfig: {
                    OriginAccessIdentity: {
                      'Fn::Join': [
                        '',
                        [
                          'origin-access-identity/cloudfront/',
                          { Ref: 'CloudFrontOAI' },
                        ],
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: {
                  DomainName: 'bucketname.s3.amazonaws.com',
                  OriginPath: '/app*',
                  S3OriginConfig: {
                    OriginAccessIdentity: {
                      'Fn::Join': [
                        '',
                        [
                          'origin-access-identity/cloudfront/',
                          { Ref: 'CloudFrontOAI' },
                        ],
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const distribution =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution

      // Should have only one origin (merged)
      expect(distribution.Properties.DistributionConfig.Origins.length).toBe(1)
    })

    it('should add edgelambda.amazonaws.com to IAM role assume policy', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      // Preserve IamRoleLambdaExecution and add the Lambda function
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.FirstLambdaFunction =
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const iamRole =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const principals =
        iamRole.Properties.AssumeRolePolicyDocument.Statement[0].Principal
          .Service

      expect(principals).toContain('edgelambda.amazonaws.com')
    })

    it('should support multiple cache behaviors with different event types', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/images/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/api/*',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const distribution =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution

      expect(distribution).toBeDefined()
      // Should have cache behaviors
      expect(
        distribution.Properties.DistributionConfig.CacheBehaviors,
      ).toBeDefined()
    })

    it('should not create resources when no cloudFront events are given', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const resources =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.CloudFrontDistribution).toBeUndefined()
    })

    it('should not throw when other events are present', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).not.toThrow()
    })

    it('should support includeBody option', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                includeBody: true,
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const distribution =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution

      expect(distribution).toBeDefined()
      // The includeBody should be in the Lambda function association
      const defaultCacheBehavior =
        distribution.Properties.DistributionConfig.DefaultCacheBehavior
      const lambdaAssociation =
        defaultCacheBehavior.LambdaFunctionAssociations[0]
      expect(lambdaAssociation.IncludeBody).toBe(true)
    })

    it('should throw error when viewer-request memorySize exceeds limit', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          memorySize: 256, // Max for viewer is 128
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      expect(() => awsCompileCloudFrontEvents.validate()).toThrow(
        /memorySize is greater than 128/,
      )
    })

    it('should throw error when origin-request memorySize exceeds limit', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          memorySize: 20480, // Max for origin is 10240
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      expect(() => awsCompileCloudFrontEvents.validate()).toThrow(
        /memorySize is greater than 10240/,
      )
    })

    it('should throw error when viewer-request timeout exceeds limit', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          timeout: 10, // Max for viewer is 5
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      expect(() => awsCompileCloudFrontEvents.validate()).toThrow(
        /timeout is greater than 5/,
      )
    })

    it('should throw error when origin-request timeout exceeds limit', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          timeout: 60, // Max for origin is 30
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      expect(() => awsCompileCloudFrontEvents.validate()).toThrow(
        /timeout is greater than 30/,
      )
    })

    it('should throw error when region is not us-east-1', () => {
      // Change the region to something else
      awsCompileCloudFrontEvents.options.region = 'eu-west-1'
      awsCompileCloudFrontEvents.serverless.service.provider.region =
        'eu-west-1'

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(
        /CloudFront associated functions have to be deployed to the us-east-1 region/,
      )
    })

    it('should throw error when multiple origins but no isDefaultOrigin', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucket1.s3.amazonaws.com/files',
                pathPattern: '/images/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucket2.s3.amazonaws.com/other',
                pathPattern: '/api/*',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(
        /more than one origin but none of the cloudfront event has "isDefaultOrigin" defined/,
      )
    })

    it('should throw error when cache policy name not found', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                cachePolicy: {
                  name: 'nonExistentPolicy',
                },
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(/references not configured cache policy/)
    })

    it('should throw error when duplicate PathPattern', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucket1.s3.amazonaws.com/files',
                pathPattern: '/images/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucket2.s3.amazonaws.com/other',
                pathPattern: '/images/*', // Duplicate path pattern
                isDefaultOrigin: true,
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(/more than one behavior with the same PathPattern/)
    })

    it('should throw error when multiple isDefaultOrigin defined', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucket1.s3.amazonaws.com/files',
                isDefaultOrigin: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucket2.s3.amazonaws.com/other',
                isDefaultOrigin: true,
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(/more than one cloudfront event with "isDefaultOrigin" defined/)
    })

    it('should throw error when event type is not unique in cache behavior', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request', // Same event type as first
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      // Preserve IamRoleLambdaExecution and add the Lambda functions
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.FirstLambdaFunction =
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        }
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.SecondLambdaFunction =
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).toThrow(/event type of a function association must be unique/)
    })

    it('should allow origin-response with higher memory and timeout limits', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          memorySize: 5120, // Within origin limit of 10240
          timeout: 25, // Within origin limit of 30
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).not.toThrow()
    })

    it('should support cache policy with id', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                cachePolicy: {
                  id: '658327ea-f89d-4fab-a63d-7e88639e58f6',
                },
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
        }

      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const distribution =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution

      expect(distribution).toBeDefined()
      expect(
        distribution.Properties.DistributionConfig.DefaultCacheBehavior
          .CachePolicyId,
      ).toBe('658327ea-f89d-4fab-a63d-7e88639e58f6')
    })

    it('should support user-defined cache policies', () => {
      // Set service name for naming
      awsCompileCloudFrontEvents.serverless.service.serviceObject = {
        name: 'my-service',
      }

      awsCompileCloudFrontEvents.serverless.service.provider.cloudFront = {
        cachePolicies: {
          myCustomPolicy: {
            DefaultTTL: 60,
            MaxTTL: 3600,
            MinTTL: 0,
            ParametersInCacheKeyAndForwardedToOrigin: {
              CookiesConfig: { CookieBehavior: 'none' },
              HeadersConfig: { HeaderBehavior: 'none' },
              QueryStringsConfig: { QueryStringBehavior: 'none' },
              EnableAcceptEncodingGzip: true,
            },
          },
        },
      }

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                cachePolicy: {
                  name: 'myCustomPolicy',
                },
              },
            },
          ],
        },
      }

      // Preserve IamRoleLambdaExecution and add the Lambda function
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.FirstLambdaFunction =
        {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        }

      // Need to call compileCloudFrontCachePolicies first to register the policy
      awsCompileCloudFrontEvents.compileCloudFrontCachePolicies()
      awsCompileCloudFrontEvents.compileCloudFrontEvents()

      const resources =
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should create the cache policy resource
      const cachePolicies = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::CloudFront::CachePolicy',
      )
      expect(cachePolicies.length).toBe(1)
    })

    it('should set default memory and timeout for functions without explicit values', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      // Call prepareFunctions which sets the defaults
      awsCompileCloudFrontEvents.prepareFunctions()

      const functionObj =
        awsCompileCloudFrontEvents.serverless.service.functions.first

      // Should set default values
      expect(functionObj.memorySize).toBe(128)
      expect(functionObj.timeout).toBe(5)
    })

    it('should enable function versioning', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      }

      // Call prepareFunctions which sets versionFunction
      awsCompileCloudFrontEvents.prepareFunctions()

      const functionObj =
        awsCompileCloudFrontEvents.serverless.service.functions.first

      expect(functionObj.versionFunction).toBe(true)
    })

    it('should support isDefaultOrigin with multiple origins', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucket1.s3.amazonaws.com/files',
                isDefaultOrigin: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucket2.s3.amazonaws.com/other',
                pathPattern: '/api/*',
              },
            },
          ],
        },
      }

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          FirstLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'first',
            },
          },
          SecondLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'second',
            },
          },
        }

      expect(() =>
        awsCompileCloudFrontEvents.compileCloudFrontEvents(),
      ).not.toThrow()
    })
  })
})
