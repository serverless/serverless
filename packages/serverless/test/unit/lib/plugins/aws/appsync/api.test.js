import { jest } from '@jest/globals'
import { Api } from '../../../../../../lib/plugins/aws/appsync/resources/Api.js'
import * as given from './given.js'

// 2020-12-09T16:24:22+00:00
jest.spyOn(Date, 'now').mockImplementation(() => 1607531062000)

const plugin = given.plugin()

describe('Api', () => {
  describe('compileEndpoint', () => {
    it('should compile the Api Resource', () => {
      const api = new Api(given.appSyncConfig(), plugin)
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource for a private endpoint', () => {
      const api = new Api(
        given.appSyncConfig({
          visibility: 'PRIVATE',
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource with config', () => {
      const api = new Api(
        given.appSyncConfig({
          introspection: false,
          queryDepthLimit: 10,
          resolverCountLimit: 20,
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource with Environments', () => {
      const api = new Api(
        given.appSyncConfig({
          environment: {
            TABLE_NAME: 'MyTable',
            OTHER_TABLE: {
              Ref: 'OtherTable',
            },
          },
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource with logs enabled', () => {
      const api = new Api(
        given.appSyncConfig({
          logging: {
            level: 'ERROR',
            excludeVerboseContent: false,
            retentionInDays: 14,
          },
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource with additional auths', () => {
      const api = new Api(
        given.appSyncConfig({
          authentication: {
            type: 'AMAZON_COGNITO_USER_POOLS',
            config: {
              userPoolId: 'pool123',
              awsRegion: 'us-east-1',
              appIdClientRegex: '[a-z]',
            },
          },
          additionalAuthentications: [
            {
              type: 'AMAZON_COGNITO_USER_POOLS',
              config: {
                userPoolId: 'pool123',
                awsRegion: 'us-east-1',
                appIdClientRegex: '[a-z]',
              },
            },
            {
              type: 'AWS_IAM',
            },
            {
              type: 'OPENID_CONNECT',
              config: {
                issuer: 'https://auth.example.com',
                clientId: '333746dd-06fc-44df-bce2-5ff108724044',
                iatTTL: 3600,
                authTTL: 60,
              },
            },
            {
              type: 'AWS_LAMBDA',
              config: {
                functionName: 'authFunction',
                identityValidationExpression: 'customm-*',
                authorizerResultTtlInSeconds: 300,
              },
            },
          ],
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
    })

    it('should compile the Api Resource with embedded authorizer Lambda function', () => {
      const api = new Api(
        given.appSyncConfig({
          authentication: {
            type: 'AWS_LAMBDA',
            config: {
              function: {
                handler: 'index.handler',
              },
            },
          },
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
      expect(api.functions).toMatchSnapshot()
    })

    it('should compile the Api Resource with embedded additional authorizer Lambda function', () => {
      const api = new Api(
        given.appSyncConfig({
          additionalAuthentications: [
            {
              type: 'AWS_LAMBDA',
              config: {
                function: {
                  handler: 'index.handler',
                },
              },
            },
          ],
        }),
        plugin,
      )
      expect(api.compileEndpoint()).toMatchSnapshot()
      expect(api.functions).toMatchSnapshot()
    })
  })

  describe('Logs', () => {
    it('should not compile CloudWatch Resources when logging not configured', () => {
      const api = new Api(given.appSyncConfig(), plugin)
      expect(api.compileCloudWatchLogGroup()).toMatchSnapshot()
    })

    it('should not compile CloudWatch Resources when logging is disabled', () => {
      const api = new Api(
        given.appSyncConfig({
          logging: {
            level: 'ERROR',
            retentionInDays: 14,
            enabled: false,
          },
        }),
        plugin,
      )
      expect(api.compileCloudWatchLogGroup()).toMatchSnapshot()
    })

    it('should compile CloudWatch Resources when enabled', () => {
      const api = new Api(
        given.appSyncConfig({
          logging: {
            level: 'ERROR',
            retentionInDays: 14,
          },
        }),
        plugin,
      )
      expect(api.compileCloudWatchLogGroup()).toMatchSnapshot()
    })
  })

  describe('apiKeys', () => {
    const api = new Api(given.appSyncConfig(), plugin)

    it('should generate an api key with sliding window expiration in numeric hours', () => {
      expect(
        api.compileApiKey({
          name: 'Default',
          description: 'Default Key',
          expiresAfter: 24,
        }),
      ).toMatchSnapshot()
    })

    it('should generate an api key with sliding window expiration in string hours', () => {
      expect(
        api.compileApiKey({
          name: 'Default',
          description: 'Default Key',
          expiresAfter: '24',
        }),
      ).toMatchSnapshot()
    })

    it('should generate an api key with sliding window expiration in duration', () => {
      expect(
        api.compileApiKey({
          name: 'Default',
          description: 'Default Key',
          expiresAfter: '30d',
        }),
      ).toMatchSnapshot()
    })

    it('should generate an api key with explicit expiresAt', () => {
      expect(
        api.compileApiKey({
          name: 'Default',
          description: 'Default Key',
          expiresAt: '2022-12-31T22:00:00+00:00',
        }),
      ).toMatchSnapshot()
    })

    it('should generate an api key with default expiry', () => {
      expect(
        api.compileApiKey({
          name: 'Default',
          description: 'Default Key',
        }),
      ).toMatchSnapshot()
    })
  })

  describe('LambdaAuthorizer', () => {
    it('should not generate the Lambda Authorizer Resources', () => {
      const api = new Api(
        given.appSyncConfig({
          authentication: {
            type: 'API_KEY',
          },
        }),
        plugin,
      )
      expect(api.compileLambdaAuthorizerPermission()).toMatchSnapshot()
    })

    it('should generate the Lambda Authorizer Resources from basic auth', () => {
      const api = new Api(
        given.appSyncConfig({
          authentication: {
            type: 'AWS_LAMBDA',
            config: {
              functionArn: 'arn:',
            },
          },
        }),
        plugin,
      )
      expect(api.compileLambdaAuthorizerPermission()).toMatchSnapshot()
    })

    it('should generate the Lambda Authorizer Resources from additional auth', () => {
      const api = new Api(
        given.appSyncConfig({
          additionalAuthentications: [
            {
              type: 'AWS_LAMBDA',
              config: {
                functionArn: 'arn:',
              },
            },
          ],
        }),
        plugin,
      )
      expect(api.compileLambdaAuthorizerPermission()).toMatchSnapshot()
    })
  })
})

describe('Caching', () => {
  it('should not generate Resources when not configured', () => {
    const api = new Api(given.appSyncConfig({ caching: undefined }), plugin)
    expect(api.compileCachingResources()).toEqual({})
  })

  it('should not generate Resources when disabled', () => {
    const api = new Api(
      given.appSyncConfig({
        caching: { enabled: false, behavior: 'FULL_REQUEST_CACHING' },
      }),
      plugin,
    )
    expect(api.compileCachingResources()).toEqual({})
  })

  it('should generate Resources with defaults', () => {
    const api = new Api(
      given.appSyncConfig({
        caching: {
          behavior: 'FULL_REQUEST_CACHING',
        },
      }),
      plugin,
    )
    expect(api.compileCachingResources()).toMatchSnapshot()
  })

  it('should generate Resources with custom Config', () => {
    const api = new Api(
      given.appSyncConfig({
        caching: {
          behavior: 'FULL_REQUEST_CACHING',
          atRestEncryption: true,
          transitEncryption: true,
          ttl: 500,
          type: 'T2_MEDIUM',
        },
      }),
      plugin,
    )
    expect(api.compileCachingResources()).toMatchSnapshot()
  })
})

describe('Domains', () => {
  it('should not generate domain resources when not configured', () => {
    const api = new Api(given.appSyncConfig({ domain: undefined }), plugin)
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })

  it('should not generate domain resources when disabled', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          enabled: false,
          name: 'api.example.com',
          certificateArn:
            'arn:aws:acm:us-east-1:1234567890:certificate/e4b6e9be-1aa7-458d-880e-069622e5be52',
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })

  it('should generate domain resources', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          name: 'api.example.com',
          hostedZoneId: 'Z111111QQQQQQQ',
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })

  it('should generate domain resources with custom certificate ARN', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          name: 'api.example.com',
          certificateArn:
            'arn:aws:acm:us-east-1:1234567890:certificate/e4b6e9be-1aa7-458d-880e-069622e5be52',
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })

  it('should not generate Route53 Record when disabled', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          name: 'api.example.com',
          certificateArn:
            'arn:aws:acm:us-east-1:1234567890:certificate/e4b6e9be-1aa7-458d-880e-069622e5be52',
          route53: false,
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain().GraphQlDomainRoute53Record).toBeUndefined()
  })

  it('should generate domain resources with custom hostedZoneId', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          name: 'api.example.com',
          certificateArn:
            'arn:aws:acm:us-east-1:1234567890:certificate/e4b6e9be-1aa7-458d-880e-069622e5be52',
          hostedZoneId: 'Z111111QQQQQQQ',
          route53: true,
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })

  it('should generate domain resources with custom hostedZoneName', () => {
    const api = new Api(
      given.appSyncConfig({
        domain: {
          name: 'foo.api.example.com',
          certificateArn:
            'arn:aws:acm:us-east-1:1234567890:certificate/e4b6e9be-1aa7-458d-880e-069622e5be52',
          hostedZoneName: 'example.com.',
          route53: true,
        },
      }),
      plugin,
    )
    expect(api.compileCustomDomain()).toMatchSnapshot()
  })
})
