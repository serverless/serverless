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
const { default: AwsCompileCloudWatchEventEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/cloud-watch-event.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileCloudWatchEventEvents', () => {
  let serverless
  let awsCompileCloudWatchEventEvents

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
    awsCompileCloudWatchEventEvents = new AwsCompileCloudWatchEventEvents(
      serverless,
    )
    awsCompileCloudWatchEventEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileCloudWatchEventEvents.provider).toBeInstanceOf(
        AwsProvider,
      )
    })
  })

  describe('#compileCloudWatchEventEvents()', () => {
    it('should create corresponding resources when cloudwatch events are given', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: false,
              },
            },
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': ['EC2 Instance State-change Notification'],
                  detail: { state: ['pending'] },
                },
                enabled: true,
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstEventsRuleCloudWatchEvent1.Type).toBe(
        'AWS::Events::Rule',
      )
      expect(resources.FirstEventsRuleCloudWatchEvent2.Type).toBe(
        'AWS::Events::Rule',
      )
      expect(resources.FirstEventsRuleCloudWatchEvent1.Properties.State).toBe(
        'DISABLED',
      )
      expect(resources.FirstEventsRuleCloudWatchEvent2.Properties.State).toBe(
        'ENABLED',
      )
    })

    it('should create Lambda permission resources', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstLambdaPermissionEventsRuleCloudWatchEvent1.Type,
      ).toBe('AWS::Lambda::Permission')
      expect(
        resources.FirstLambdaPermissionEventsRuleCloudWatchEvent1.Properties
          .Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionEventsRuleCloudWatchEvent1.Properties
          .Principal,
      ).toBe('events.amazonaws.com')
    })

    it('should support input property', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
                input: '{"key": "value"}',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].Input,
      ).toBe('{"key": "value"}')
    })

    it('should support inputPath property', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
                inputPath: '$.detail',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0]
          .InputPath,
      ).toBe('$.detail')
    })

    it('should support inputTransformer property', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
                inputTransformer: {
                  inputPathsMap: {
                    instance: '$.detail.instance-id',
                  },
                  inputTemplate: '{"instance": <instance>}',
                },
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0]
          .InputTransformer,
      ).toEqual({
        InputPathsMap: { instance: '$.detail.instance-id' },
        InputTemplate: '{"instance": <instance>}',
      })
    })

    it('should support name and description properties', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
                name: 'my-rule-name',
                description: 'My rule description',
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstEventsRuleCloudWatchEvent1.Properties.Name).toBe(
        'my-rule-name',
      )
      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.Description,
      ).toBe('My rule description')
    })

    it('should respect enabled property set to false', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstEventsRuleCloudWatchEvent1.Properties.State).toBe(
        'DISABLED',
      )
    })

    it('should default enabled to true', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                },
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstEventsRuleCloudWatchEvent1.Properties.State).toBe(
        'ENABLED',
      )
    })

    it('should create resources for multiple functions', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: { source: ['aws.ec2'] },
              },
            },
          ],
        },
        second: {
          events: [
            {
              cloudwatchEvent: {
                event: { source: ['aws.s3'] },
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstEventsRuleCloudWatchEvent1).toBeDefined()
      expect(resources.SecondEventsRuleCloudWatchEvent1).toBeDefined()
    })

    it('should handle multi-line variables by stripping newlines', () => {
      awsCompileCloudWatchEventEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudwatchEvent: {
                event: {
                  source: ['aws.ec2'],
                  'detail-type': [
                    'EC2 Instance State-change Notification \n with newline',
                  ],
                  detail: { state: ['pending'] },
                },
                enabled: false,
                input: {
                  key: 'value\n',
                },
              },
            },
          ],
        },
      }

      awsCompileCloudWatchEventEvents.compileCloudWatchEventEvents()

      const resources =
        awsCompileCloudWatchEventEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Newlines should be stripped from detail-type
      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.EventPattern[
          'detail-type'
        ][0],
      ).toBe('EC2 Instance State-change Notification  with newline')
      // Newlines should be stripped from input
      expect(
        resources.FirstEventsRuleCloudWatchEvent1.Properties.Targets[0].Input,
      ).toBe('{"key":"value"}')
    })
  })
})
