import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn(), link: jest.fn((url) => url) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileCloudWatchLogEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/cloud-watch-log.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileCloudWatchLogEvents', () => {
  let serverless
  let awsCompileCloudWatchLogEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = { log: jest.fn() }
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider(
      'aws',
      new AwsProvider(serverless, { region: 'us-east-1' }),
    )
    awsCompileCloudWatchLogEvents = new AwsCompileCloudWatchLogEvents(
      serverless,
    )
    awsCompileCloudWatchLogEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileCloudWatchLogEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileCloudWatchLogEvents()', () => {
    it('should create corresponding resources when cloudwatchLog events are given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
              },
            },
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello2',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLogsSubscriptionFilterCloudWatchLog1.Type).toBe(
        'AWS::Logs::SubscriptionFilter',
      )
      expect(resources.FirstLogsSubscriptionFilterCloudWatchLog2.Type).toBe(
        'AWS::Logs::SubscriptionFilter',
      )
      expect(
        resources.FirstLogsSubscriptionFilterCloudWatchLog1.Properties
          .LogGroupName,
      ).toBe('/aws/lambda/hello1')
      expect(
        resources.FirstLogsSubscriptionFilterCloudWatchLog2.Properties
          .LogGroupName,
      ).toBe('/aws/lambda/hello2')
    })

    it('should create Lambda permission resources', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find the Lambda permission resource (naming may vary)
      const permissionResources = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::Permission',
      )

      expect(permissionResources.length).toBeGreaterThan(0)
      const [, permission] = permissionResources[0]
      expect(permission.Properties.Action).toBe('lambda:InvokeFunction')
      // Principal is a CloudFormation Fn::Join that constructs logs.<region>.amazonaws.com
      expect(permission.Properties.Principal).toBeDefined()
      if (typeof permission.Properties.Principal === 'string') {
        expect(permission.Properties.Principal).toMatch(/logs.*amazonaws\.com/)
      } else {
        // Fn::Join structure
        expect(permission.Properties.Principal['Fn::Join']).toBeDefined()
      }
    })

    it('should support string shorthand for logGroup', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/shorthand',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstLogsSubscriptionFilterCloudWatchLog1.Properties
          .LogGroupName,
      ).toBe('/aws/lambda/shorthand')
    })

    it('should support filter property', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
                filter: 'ERROR',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstLogsSubscriptionFilterCloudWatchLog1.Properties
          .FilterPattern,
      ).toBe('ERROR')
    })

    it('should default filter to empty string', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: {
                logGroup: '/aws/lambda/hello1',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstLogsSubscriptionFilterCloudWatchLog1.Properties
          .FilterPattern,
      ).toBe('')
    })

    it('should create resources for multiple functions', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
        second: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello2',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLogsSubscriptionFilterCloudWatchLog1).toBeDefined()
      expect(resources.SecondLogsSubscriptionFilterCloudWatchLog1).toBeDefined()
    })

    it('should create resources for each function even with same logGroup', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/shared',
            },
          ],
        },
        second: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/shared',
            },
          ],
        },
      }

      // sf-core doesn't throw - it creates resources for both
      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const subscriptionFilters = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Logs::SubscriptionFilter',
      )

      expect(subscriptionFilters.length).toBe(2)
    })

    it('should respect 2 cloudwatchLog events for same function', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
            {
              cloudwatchLog: '/aws/lambda/hello2',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const subscriptionFilters = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Logs::SubscriptionFilter',
      )

      expect(subscriptionFilters.length).toBe(2)
    })

    it('should not create corresponding resources when cloudwatchLog event is not given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const subscriptionFilters = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Logs::SubscriptionFilter',
      )

      expect(subscriptionFilters.length).toBe(0)
    })

    it('should not create corresponding resources when "events" property is not given', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {},
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const subscriptionFilters = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Logs::SubscriptionFilter',
      )

      expect(subscriptionFilters.length).toBe(0)
    })

    it('should have the filter depend on the permission', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const subscriptionFilter =
        resources.FirstLogsSubscriptionFilterCloudWatchLog1
      expect(subscriptionFilter.DependsOn).toBeDefined()
    })

    it('should not throw when other events are present', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
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

      expect(() =>
        awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents(),
      ).not.toThrow()
    })

    it('should create a longest-common suffix of logGroup to minimize scope', () => {
      // Single log group
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
        ]),
      ).toBe('/aws/lambda/hello1')

      // Two similar log groups
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
          '/aws/lambda/hello2',
        ]),
      ).toBe('/aws/lambda/hello*')

      // Shorter common prefix
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
          '/aws/lambda/hot',
        ]),
      ).toBe('/aws/lambda/h*')

      // Only common up to /aws/lambda/
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
          '/aws/lambda/tweet',
        ]),
      ).toBe('/aws/lambda/*')

      // Common up to /aws/l
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
          '/aws/lex/log1',
          '/aws/lightsail/log1',
        ]),
      ).toBe('/aws/l*')

      // Common up to /aws/
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/hello1',
          '/aws/batch/log1',
        ]),
      ).toBe('/aws/*')

      // Wildcard already present
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/*',
          '/aws/lambda/hello',
        ]),
      ).toBe('/aws/*')

      // Wildcard at lambda level
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/*',
          '/aws/lambda/hello',
        ]),
      ).toBe('/aws/lambda/*')

      // Without trailing slash
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda',
          '/aws/lambda/hello',
        ]),
      ).toBe('/aws/lambda*')

      // Complex case
      expect(
        awsCompileCloudWatchLogEvents.longestCommonSuffix([
          '/aws/lambda/yada-dev-dummy',
          '/aws/lambda/yada-dev-dummy2',
        ]),
      ).toBe('/aws/lambda/yada-dev-dummy*')
    })

    it('should not have the permission depend on the cloud watch log', () => {
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissionResource = Object.entries(resources).find(
        ([, resource]) => resource.Type === 'AWS::Lambda::Permission',
      )

      expect(permissionResource).toBeDefined()
      // Permission should not depend on anything (no DependsOn) unless there's an alias
      const [, permission] = permissionResource
      expect(permission.DependsOn).toBeUndefined()
    })

    it('should have the filter depend on the lambda alias when provisionedConcurrency is set', () => {
      // Simulate what the function alias compiler does when provisionedConcurrency is set
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          // targetAlias is set by another plugin when provisionedConcurrency is configured
          targetAlias: { logicalId: 'FirstProvConcLambdaAlias' },
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const filterResource = Object.entries(resources).find(
        ([, resource]) => resource.Type === 'AWS::Logs::SubscriptionFilter',
      )

      expect(filterResource).toBeDefined()
      const [, filter] = filterResource
      // Filter should depend on both the permission AND the alias
      expect(filter.DependsOn).toContain(
        'FirstLambdaPermissionLogsSubscriptionFilterCloudWatchLog',
      )
      expect(filter.DependsOn).toContain('FirstProvConcLambdaAlias')
    })

    it('should have the permission depend on the lambda alias when provisionedConcurrency is set', () => {
      // Simulate what the function alias compiler does when provisionedConcurrency is set
      awsCompileCloudWatchLogEvents.serverless.service.functions = {
        first: {
          // targetAlias is set by another plugin when provisionedConcurrency is configured
          targetAlias: { logicalId: 'FirstProvConcLambdaAlias' },
          events: [
            {
              cloudwatchLog: '/aws/lambda/hello1',
            },
          ],
        },
      }

      awsCompileCloudWatchLogEvents.compileCloudWatchLogEvents()

      const resources =
        awsCompileCloudWatchLogEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissionResource = Object.entries(resources).find(
        ([, resource]) => resource.Type === 'AWS::Lambda::Permission',
      )

      expect(permissionResource).toBeDefined()
      const [, permission] = permissionResource
      // Permission should depend on the alias when provisionedConcurrency is set
      expect(permission.DependsOn).toContain('FirstProvConcLambdaAlias')
    })
  })
})
