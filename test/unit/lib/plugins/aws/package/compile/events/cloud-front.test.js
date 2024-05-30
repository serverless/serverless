'use strict'

const chai = require('chai')
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider')
const AwsCompileCloudFrontEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/cloud-front')
const Serverless = require('../../../../../../../../lib/serverless')
const runServerless = require('../../../../../../../utils/run-serverless')

chai.use(require('sinon-chai'))
chai.use(require('chai-as-promised'))

const { expect } = chai

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

  describe('#compileCloudFrontEvents()', () => {
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

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution
          .Properties.DistributionConfig.Origins[0],
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/app*',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/app*',
        S3OriginConfig: {
          OriginAccessIdentity: {
            'Fn::Join': [
              '',
              ['origin-access-identity/cloudfront/', { Ref: 'CloudFrontOAI' }],
            ],
          },
        },
      })

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.CloudFrontDistribution
          .Properties.DistributionConfig.Origins.length,
      ).to.equal(1)
    })
  })
})

describe('test/unit/lib/plugins/aws/package/compile/events/cloudFront.test.js', () => {
  describe.skip('TODO: Removal notice', () => {
    it('should show preconfigured notice on "sls remove" if service has cloudFront event', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L88-L109

      // Inspect result.stdoutData
      await runServerless({
        fixture: 'function',
        command: 'remove',
        lastLifecycleHookName: 'before:remove:remove',
      })
    })

    it('should not show preconfigured notice on "sls remove" if service doesn\'t have cloudFront event', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L113-L118

      // Inspect result.stdoutData
      await runServerless({
        fixture: 'function',
        command: 'remove',
        lastLifecycleHookName: 'before:remove:remove',
      })
    })
  })

  describe('Validation', () => {
    it('should throw if function `memorySize` is greater than 128 for `functions[].events.cloudfront.evenType: "viewer-request"`', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                memorySize: 129,
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'LAMBDA_EDGE_UNSUPPORTED_MEMORY_SIZE',
      )
    })

    it('should throw if function `timeout` is greater than 5 for for `functions[].events.cloudfront.evenType: "viewer-request"', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                timeout: 6,
                handler: 'index.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'LAMBDA_EDGE_UNSUPPORTED_TIMEOUT_VALUE',
      )
    })

    it('should throw if function `timeout` is greater than 30 for `functions[].events.cloudfront.evenType: "origin-request"`', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                handler: 'index.handler',
                timeout: 31,
                events: [
                  {
                    cloudFront: {
                      eventType: 'origin-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'LAMBDA_EDGE_UNSUPPORTED_TIMEOUT_VALUE',
      )
    })

    it('should throw if function `timeout` is greater than 30 for `functions[].events.cloudfront.evenType: "origin-response"`', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                handler: 'index.handler',
                timeout: 31,
                events: [
                  {
                    cloudFront: {
                      eventType: 'origin-response',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'LAMBDA_EDGE_UNSUPPORTED_TIMEOUT_VALUE',
      )
    })

    it('should throw an error if the region is not us-east-1', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          options: {
            region: 'eu-central-1',
          },
          configExt: {
            functions: {
              basic: {
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
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'CLOUDFRONT_INVALID_REGION',
      )
    })

    it('should throw if more than one cloudfront event with different origins were defined as a default', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                name: 'first',
                handler: 'first.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      isDefaultOrigin: true,
                    },
                  },
                ],
              },
              second: {
                name: 'second',
                handler: 'second.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://anotherbucket.s3.amazonaws.com/files',
                      isDefaultOrigin: true,
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS',
      )
    })
    it('should throw if none of the cloudfront events with different origins were defined as a default', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                name: 'first',
                handler: 'first.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      pathPattern: '/files/*',
                    },
                  },
                ],
              },
              second: {
                name: 'second',
                handler: 'second.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://anotherbucket.s3.amazonaws.com/files',
                      pathPattern: '/anotherfiles/*',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'CLOUDFRONT_MULTIPLE_DEFAULT_ORIGIN_EVENTS',
      )
    })

    it('Should throw if lambda config refers a non-existing cache policy by name', () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                handler: 'myLambdaAtEdge.handler',
                events: [
                  {
                    cloudFront: {
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      eventType: 'viewer-response',
                      cachePolicy: {
                        name: 'not-existing-cache-policy',
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'UNRECOGNIZED_CLOUDFRONT_CACHE_POLICY',
      )
    })
  })

  describe('Alternative cases', () => {
    it('should not create cloudfront distribution when no cloudFront events are given', async () => {
      return expect(
        await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                handler: 'first.handler',
                name: 'first',
              },
              second: {
                name: 'second',
                handler: 'second.handler',
                events: [
                  {
                    http: 'GET /',
                  },
                ],
              },
            },
          },
        }),
      ).to.not.have.any.keys('CloudFrontDistribution')
    })

    it('should create DefaultCacheBehavior if there are no events without PathPattern configured', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            first: {
              name: 'first',
              handler: 'first.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 's3://bucketname.s3.amazonaws.com/files',
                    pathPattern: '/files/*',
                  },
                },
              ],
            },
          },
        },
      })
      const cfCloudFrontDistributionConfig =
        cfTemplate.Resources.CloudFrontDistribution.Properties
          .DistributionConfig
      expect(cfCloudFrontDistributionConfig.DefaultCacheBehavior).to.eql({
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
      })
      expect(cfCloudFrontDistributionConfig.CacheBehaviors.length).to.equal(1)
      expect(
        cfCloudFrontDistributionConfig.CacheBehaviors[0],
      ).to.have.deep.include({
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        PathPattern: '/files/*',
      })
    })

    it('should throw if more than one origin with the same PathPattern', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                name: 'first',
                handler: 'first.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      pathPattern: '/files/*',
                    },
                  },
                ],
              },
              second: {
                name: 'second',
                handler: 'second.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'origin-request',
                      origin: 's3://anotherbucket.s3.amazonaws.com/files',
                      pathPattern: '/files/*',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'CLOUDFRONT_MULTIPLE_BEHAVIORS_FOR_SINGLE_PATH_PATTERN',
      )
    })

    it('should throw if more than one origin with the same event type', async () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              first: {
                name: 'first',
                handler: 'first.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      pathPattern: '/files/*',
                    },
                  },
                ],
              },
              second: {
                name: 'second',
                handler: 'second.handler',
                events: [
                  {
                    cloudFront: {
                      eventType: 'viewer-request',
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      pathPattern: '/files/*',
                    },
                  },
                ],
              },
            },
          },
        }),
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'CLOUDFRONT_EVENT_TYPE_NON_UNIQUE_CACHE_BEHAVIOR',
      )
    })
  })

  describe('Resource generation', () => {
    let cfResources
    let cfOutputs
    let naming
    let serviceName
    let cfDistribution

    const stage = 'custom-stage'
    const cachePolicyName = 'allInCache'
    const cachePolicyId = '08627262-05a9-4f76-9ded-b50ca2e3a84f'
    const cachePolicyId2 = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
    const cachePolicyConfig = {
      DefaultTTL: 60,
      MinTTL: 30,
      MaxTTL: 3600,
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: {
          CookieBehavior: 'whitelist',
          Cookies: ['my-public-cookie'],
        },
        EnableAcceptEncodingBrotli: true,
        EnableAcceptEncodingGzip: true,
        HeadersConfig: {
          HeaderBehavior: 'whitelist',
          Headers: ['authorization', 'content-type'],
        },
        QueryStringsConfig: {
          QueryStringBehavior: 'allExcept',
          QueryStrings: ['not-cached-query-string'],
        },
      },
    }
    const responseHeadersPolicyId = '5cc3b908-e619-4b99-88e5-2cf7f45965bd'

    const getAssociatedCacheBehavior = (pathPattern) =>
      cfResources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.find(
        (cacheBehavior) => cacheBehavior.PathPattern === pathPattern,
      )

    before(async () => {
      const {
        awsNaming,
        cfTemplate,
        fixtureData: {
          serviceConfig: { service },
        },
      } = await runServerless({
        fixture: 'function',
        command: 'package',
        options: { stage },
        configExt: {
          provider: {
            versionFunctions: false,
            cloudFront: {
              cachePolicies: {
                [cachePolicyName]: cachePolicyConfig,
              },
            },
            environment: { HELLO_PROVIDER: 'WORLD' },
            vpc: {
              securityGroupIds: ['sg-98f38XXX'],
              subnetIds: ['subnet-978ffXXX', 'subnet-5e59fXXX'],
            },
          },
          functions: {
            fnOriginRequest: {
              handler: 'index.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'origin-request',
                    origin: 'https://example.com',
                    pathPattern: 'noPolicy',
                  },
                },
              ],
              environment: { HELLO: 'WORLD' },
              vpc: {
                securityGroupIds: ['sg-98f38XXX'],
                subnetIds: ['subnet-978ffXXX', 'subnet-5e59fXXX'],
              },
            },
            fnOriginResponse: {
              handler: 'index.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'origin-response',
                    origin: 'https://example.com',
                  },
                },
              ],
            },
            fnCustomOriginRequest: {
              handler: 'index.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    pathPattern: 'noCustomOriginPolicy',
                    origin: {
                      DomainName: 'amazonaws.com',
                      CustomOriginConfig: {
                        OriginKeepaliveTimeout: 1,
                        OriginReadTimeout: 2,
                        OriginProtocolPolicy: 'http-only',
                      },
                    },
                  },
                },
              ],
            },
            fnCachePolicy: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com/files',
                    eventType: 'viewer-response',
                    pathPattern: 'userConfiguredPolicy',
                    cachePolicy: {
                      name: cachePolicyName,
                    },
                  },
                },
              ],
            },
            fnCachePolicyManaged: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'managedPolicy',
                    cachePolicy: {
                      id: cachePolicyId,
                    },
                  },
                },
              ],
            },
            fnCachePolicyManagedSetViaBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'managedPolicySetViaBehavior',
                    behavior: {
                      CachePolicyId: cachePolicyId,
                      ResponseHeadersPolicyId: responseHeadersPolicyId,
                    },
                  },
                },
              ],
            },
            fnCachePolicySetViaCachePolicyIdAndBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'policySetViaCachePolicyIdAndBehavior',
                    cachePolicy: {
                      id: cachePolicyId,
                    },
                    behavior: {
                      CachePolicyId: cachePolicyId2,
                    },
                  },
                },
              ],
            },
            fnCachePolicySetViaCachePolicyNameAndBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'policySetViaCachePolicyNameAndBehavior',
                    cachePolicy: {
                      name: cachePolicyName,
                    },
                    behavior: {
                      CachePolicyId: cachePolicyId2,
                    },
                  },
                },
              ],
            },
            fnLegacyCacheSettings: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'legacyCacheSettings',
                    behavior: {
                      MaxTTL: 0,
                      MinTTL: 0,
                      DefaultTTL: 0,
                      ForwardedValues: {
                        QueryString: true,
                        Cookies: {
                          Forward: 'none',
                        },
                      },
                    },
                  },
                },
              ],
            },
            fnCachePolicyManagedSetViaBehaviorRequest: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 's3://bucketname.s3.amazonaws.com/files',
                    pathPattern: 'managedPolicySetViaBehaviorRequest',
                    behavior: {
                      ForwardedValues: {
                        QueryString: true,
                        Headers: ['*'],
                      },
                      ViewerProtocolPolicy: 'https-only',
                      AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
                      CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
                    },
                  },
                },
              ],
            },
            fnOrginPath: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://anotherbucket.s3.amazonaws.com/files',
                    eventType: 'viewer-request',
                    pathPattern: '/another*',
                  },
                },
              ],
            },
            fnMultiOrigin: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 's3://one.s3.amazonaws.com/files',
                    pathPattern: 'fnMultiOrigin',
                  },
                },
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 's3://two.s3.amazonaws.com/files',
                    pathPattern: '/fnMultiOrigin*',
                  },
                },
              ],
            },
            fnSameOriginDifferentProtcol: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 'https://protocol.s3.amazonaws.com/files',
                    pathPattern: '/fnSameOriginDifferentProtcol1*',
                  },
                },
                {
                  cloudFront: {
                    eventType: 'viewer-request',
                    origin: 's3://protocol.s3.amazonaws.com/files',
                    pathPattern: '/fnSameOriginDifferentProtcol2*',
                  },
                },
              ],
            },
          },
        },
      })
      cfResources = cfTemplate.Resources
      cfOutputs = cfTemplate.Outputs
      naming = awsNaming
      serviceName = service
      cfDistribution = cfResources[naming.getCloudFrontDistributionLogicalId()]
    })

    it('should configure needed resources', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest')
      const iamRoleDocument = cfResources[naming.getRoleLogicalId()]

      expect(cfDistribution.Type).to.equal('AWS::CloudFront::Distribution')

      expect(cfDistribution.Properties.DistributionConfig.Enabled).to.equal(
        true,
      )

      expect(
        cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .ViewerProtocolPolicy,
      ).to.equal('allow-all')

      expect(
        cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .TargetOriginId,
      ).to.equal('custom/example.com')

      expect(
        cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .LambdaFunctionAssociations[0],
      ).to.includes({
        EventType: 'origin-response',
      })
      expect(
        cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .LambdaFunctionAssociations[0],
      ).to.includes({
        EventType: 'origin-response',
      })

      expect(cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior)
        .to.have.nested.property(
          'LambdaFunctionAssociations[0].LambdaFunctionARN.Ref',
        )
        .to.be.a('string')
        .and.match(/^FnOriginResponseLambdaVersion.*$/)

      expect(
        cfDistribution.Properties.DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'example.com',
          CustomOriginConfig: {
            OriginProtocolPolicy: 'match-viewer',
          },
          Id: 'custom/example.com',
        },
      ])

      expect(
        iamRoleDocument.Properties.AssumeRolePolicyDocument.Statement[0],
      ).to.deep.eql({
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
        },
        Action: ['sts:AssumeRole'],
      })
      expect(
        iamRoleDocument.Properties.Policies[0].PolicyDocument.Statement,
      ).to.deep.include.members([
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:TagResource',
          ],
          Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:logs:*:*:*' }],
        },
      ])
      expect(cfResources[edgeResolvedName].DeletionPolicy).to.equal('Retain')
    })

    it('should configure distribution config comment', () => {
      const distributionConfig =
        cfResources[naming.getCloudFrontDistributionLogicalId()].Properties
          .DistributionConfig
      expect(distributionConfig.Comment).to.equal(`${serviceName} ${stage}`)
    })

    it('should ensure that triggered functions are versioned', () => {
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnOriginRequest'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnCustomOriginRequest'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnOriginResponse'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnCachePolicy'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnCachePolicyManaged'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId(
          'fnCachePolicyManagedSetViaBehavior',
        ),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId(
          'fnCachePolicySetViaCachePolicyIdAndBehavior',
        ),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId(
          'fnCachePolicySetViaCachePolicyNameAndBehavior',
        ),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnLegacyCacheSettings'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId(
          'fnCachePolicyManagedSetViaBehaviorRequest',
        ),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnOrginPath'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnMultiOrigin'),
      )
      expect(cfOutputs).to.have.property(
        naming.getLambdaVersionOutputLogicalId('fnSameOriginDifferentProtcol'),
      )
    })
    it('should ensure that triggered functions have 128MB as default `memorySize`', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest')
      expect(cfResources[edgeResolvedName].Properties.MemorySize).to.equal(128)
    })

    it('should ensure that triggered functions have 5s for default `timeout`', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest')
      expect(cfResources[edgeResolvedName].Properties.Timeout).to.equal(5)
    })

    it('should create different origins for different domains with the same path', () => {
      expect(
        cfDistribution.Properties.DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'bucketname.s3.amazonaws.com',
          OriginPath: '/files',
          S3OriginConfig: {},
          Id: 's3/bucketname.s3.amazonaws.com/files',
        },
        {
          DomainName: 'anotherbucket.s3.amazonaws.com',
          OriginPath: '/files',
          S3OriginConfig: {},
          Id: 's3/anotherbucket.s3.amazonaws.com/files',
        },
      ])

      expect(
        cfDistribution.Properties.DistributionConfig.Origins.length,
      ).to.greaterThanOrEqual(2)
    })

    it('should create different origins for the same domains with the same path but different protocols', () => {
      expect(
        cfDistribution.Properties.DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'protocol.s3.amazonaws.com',
          OriginPath: '/files',
          CustomOriginConfig: { OriginProtocolPolicy: 'match-viewer' },
          Id: 'custom/protocol.s3.amazonaws.com/files',
        },
        {
          DomainName: 'protocol.s3.amazonaws.com',
          OriginPath: '/files',
          S3OriginConfig: {},
          Id: 's3/protocol.s3.amazonaws.com/files',
        },
      ])
      expect(
        cfDistribution.Properties.DistributionConfig.Origins.length,
      ).to.greaterThanOrEqual(2)
    })

    it('should create different origins with different ids for different domains in the same function', () => {
      expect(
        cfDistribution.Properties.DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'one.s3.amazonaws.com',
          OriginPath: '/files',
          S3OriginConfig: {},
          Id: 's3/one.s3.amazonaws.com/files',
        },
        {
          DomainName: 'two.s3.amazonaws.com',
          OriginPath: '/files',
          S3OriginConfig: {},
          Id: 's3/two.s3.amazonaws.com/files',
        },
      ])

      expect(
        cfDistribution.Properties.DistributionConfig.Origins.length,
      ).to.greaterThanOrEqual(2)
    })

    it('should use previous created origin for the same params', () => {
      expect(
        cfDistribution.Properties.DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'bucketname.s3.amazonaws.com',
          S3OriginConfig: {},
          Id: 's3/bucketname.s3.amazonaws.com',
        },
      ])
    })

    it('should support origin customization', () => {
      expect(
        cfResources[naming.getCloudFrontDistributionLogicalId()].Properties
          .DistributionConfig.Origins,
      ).to.deep.include.members([
        {
          DomainName: 'amazonaws.com',
          CustomOriginConfig: {
            OriginKeepaliveTimeout: 1,
            OriginReadTimeout: 2,
            OriginProtocolPolicy: 'http-only',
          },
          Id: 'custom/amazonaws.com',
        },
      ])
    })

    it('should assign a DefaultCacheBehavior behavior to event without PathPattern', () => {
      expect(
        cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior,
      ).to.include({
        ViewerProtocolPolicy: 'allow-all',
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 'custom/example.com',
      })
      expect(cfDistribution.Properties.DistributionConfig.DefaultCacheBehavior)
        .to.have.nested.property(
          'LambdaFunctionAssociations[0].LambdaFunctionARN.Ref',
        )
        .to.be.a('string')
        .and.match(/^FnOriginResponseLambdaVersion.*$/)
    })

    it('should create DefaultCacheBehavior if there are no events without PathPattern configured and isDefaultOrigin flag was set', async () => {
      expect(cfDistribution.Properties.DistributionConfig).to.contain.keys(
        'DefaultCacheBehavior',
      )
    })

    it('should support behavior customization', () => {
      expect(
        getAssociatedCacheBehavior('managedPolicySetViaBehaviorRequest'),
      ).to.have.deep.includes({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'https-only',
        ForwardedValues: { QueryString: true, Headers: ['*'] },
        AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
      })
    })

    it('should ignore environment variables if provided in function properties', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest')
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys(
        'Environment',
      )
    })
    it('Should ignore VPC config if provided in function properties', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest')
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys(
        'VpcConfig',
      )
    })
    it('should ignore provider environment variables', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginResponse')
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys(
        'Environment',
      )
    })
    it('should ignore provider VPC config', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginResponse')
      const otherResolvedName = naming.getLambdaLogicalId('basic')
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys(
        'VpcConfig',
      )
      expect(cfResources[otherResolvedName].Properties).to.contain.keys(
        'VpcConfig',
      )
    })

    it('should create cache policies listed in provider.cloudFront.cachePolicies property', () => {
      const cachePolicyLogicalId =
        naming.getCloudFrontCachePolicyLogicalId(cachePolicyName)
      const cachePolicyConfigProperties =
        cfResources[cachePolicyLogicalId].Properties.CachePolicyConfig
      expect(cachePolicyConfigProperties).to.deep.eq({
        Name: `${serviceName}-${stage}-${cachePolicyName}`,
        ...cachePolicyConfig,
      })
    })

    it('should attach a cache policy to a cloudfront behavior when specified by name in lambda config', () => {
      const cachePolicyLogicalId =
        naming.getCloudFrontCachePolicyLogicalId(cachePolicyName)
      expect(
        getAssociatedCacheBehavior('userConfiguredPolicy').CachePolicyId,
      ).to.deep.eq({
        Ref: cachePolicyLogicalId,
      })
    })

    it('Should attach a cache policy to a cloudfront behavior when specified by id in lambda config', () => {
      expect(getAssociatedCacheBehavior('managedPolicy').CachePolicyId).to.eq(
        cachePolicyId,
      )
    })

    it('Should attach a cache policy to a cloudfront behavior when specified by id via `behavior.CachePolicyId` in lambda config', () => {
      expect(
        getAssociatedCacheBehavior('managedPolicySetViaBehavior').CachePolicyId,
      ).to.eq(cachePolicyId)
    })

    it('Should attach a response headers policy to a cloudfront behavior when specified by id via `behavior.ResponseHeadersPolicyId` in lambda config', () => {
      expect(
        getAssociatedCacheBehavior('managedPolicySetViaBehavior')
          .ResponseHeadersPolicyId,
      ).to.eq(responseHeadersPolicyId)
    })

    it('Should attach a cache policy specified via `cachePolicy.id` to a cloudfront behavior when specified via both of `cachePolicy.id` and `behavior.CachePolicyId` in lambda config', () => {
      expect(
        getAssociatedCacheBehavior('policySetViaCachePolicyIdAndBehavior')
          .CachePolicyId,
      ).to.eq(cachePolicyId)
    })

    it('Should attach a cache policy specified via `cachePolicy.name` to a cloudfront behavior when specified via both of `cachePolicy.name` and `behavior.CachePolicyId` in lambda config', () => {
      const cachePolicyLogicalId =
        naming.getCloudFrontCachePolicyLogicalId(cachePolicyName)
      expect(
        getAssociatedCacheBehavior('policySetViaCachePolicyNameAndBehavior')
          .CachePolicyId,
      ).to.deep.eq({
        Ref: cachePolicyLogicalId,
      })
    })

    it('Should attach a default cache policy when none are provided', () => {
      // Default Managed-CachingOptimized Cache Policy id
      const defaultCachePolicyId = '658327ea-f89d-4fab-a63d-7e88639e58f6'
      expect(getAssociatedCacheBehavior('noPolicy').CachePolicyId).to.eq(
        defaultCachePolicyId,
      )
    })

    it('Should use legacy cache settings', () => {
      expect(
        getAssociatedCacheBehavior('legacyCacheSettings'),
      ).not.to.contain.keys('CachePolicyId')
      expect(getAssociatedCacheBehavior('legacyCacheSettings')).to.contain.keys(
        'MinTTL',
        'MaxTTL',
        'DefaultTTL',
        'ForwardedValues',
      )
    })
  })
})
