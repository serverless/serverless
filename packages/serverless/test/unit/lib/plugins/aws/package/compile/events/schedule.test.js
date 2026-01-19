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

const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileScheduledEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/schedule.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

const METHOD_SCHEDULER = 'scheduler'
const METHOD_EVENT_BUS = 'eventBus'

describe('AwsCompileScheduledEvents', () => {
  let serverless
  let awsCompileScheduledEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = { log: jest.fn() }
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        // Pre-create the Lambda function resource that schedule compiler expects
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          },
        },
      },
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(
      serverless,
      options,
    )
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileScheduledEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileScheduledEvents()', () => {
    it('should create CloudWatch Events rule with rate expression', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: 'rate(10 minutes)',
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Find Events Rule
      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      const [, rule] = rulesEntries[0]
      expect(rule.Type).toBe('AWS::Events::Rule')
      expect(rule.Properties.ScheduleExpression).toBe('rate(10 minutes)')
      expect(rule.Properties.State).toBe('ENABLED')
    })

    it('should create CloudWatch Events rule with cron expression', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: 'cron(0 12 * * ? *)',
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      expect(rulesEntries[0][1].Properties.ScheduleExpression).toBe(
        'cron(0 12 * * ? *)',
      )
    })

    it('should create CloudWatch Events rule with object notation', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(1 hour)'],
                enabled: false,
                name: 'my-schedule',
                description: 'My schedule description',
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      const [, rule] = rulesEntries[0]
      expect(rule.Properties.ScheduleExpression).toBe('rate(1 hour)')
      expect(rule.Properties.State).toBe('DISABLED')
      expect(rule.Properties.Name).toBe('my-schedule')
      expect(rule.Properties.Description).toBe('My schedule description')
    })

    it('should support input as string', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                input: '{"key": "value"}',
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      expect(rulesEntries[0][1].Properties.Targets[0].Input).toBe(
        '{"key": "value"}',
      )
    })

    it('should support input as object', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                input: { key: 'value' },
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      expect(rulesEntries[0][1].Properties.Targets[0].Input).toBe(
        '{"key":"value"}',
      )
    })

    it('should support inputPath', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      expect(rulesEntries[0][1].Properties.Targets[0].InputPath).toBe(
        '$.stageVariables',
      )
    })

    it('should support inputTransformer', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                inputTransformer: {
                  inputPathsMap: {
                    eventTime: '$.time',
                  },
                  inputTemplate: '{"time": <eventTime>}',
                },
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
      expect(rulesEntries[0][1].Properties.Targets[0].InputTransformer).toEqual(
        {
          InputPathsMap: {
            eventTime: '$.time',
          },
          InputTemplate: '{"time": <eventTime>}',
        },
      )
    })

    it('should create multiple rules for multiple rate values', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(1 hour)', 'rate(2 hours)'],
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(2)
    })

    it('should create Lambda permission for CloudWatch Events', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: 'rate(10 minutes)',
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissions = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::Permission',
      )

      expect(permissions.length).toBe(1)
      expect(permissions[0][1].Properties.Action).toBe('lambda:InvokeFunction')
      expect(permissions[0][1].Properties.Principal).toBe(
        'events.amazonaws.com',
      )
    })

    it('should create Scheduler Schedule when method is scheduler', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(15 minutes)'],
                method: METHOD_SCHEDULER,
                name: 'scheduler-event',
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const schedulerSchedules = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Scheduler::Schedule',
      )

      expect(schedulerSchedules.length).toBe(1)
      const [, schedule] = schedulerSchedules[0]
      expect(schedule.Type).toBe('AWS::Scheduler::Schedule')
      expect(schedule.Properties.ScheduleExpression).toBe('rate(15 minutes)')
      expect(schedule.Properties.Name).toBe('scheduler-event')
    })

    it('should create EventBridge rule by default (method: eventBus)', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                method: METHOD_EVENT_BUS,
              },
            },
          ],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rulesEntries = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Events::Rule',
      )

      expect(rulesEntries.length).toBe(1)
    })

    it('should throw an error if a "name" is specified with multiple rate expressions', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                enabled: false,
                name: 'your-scheduled-event-name',
              },
            },
          ],
        },
      }

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).toThrow(
        /cannot specify a name when defining more than one rate expression/i,
      )
    })

    it('should throw when passing "inputPath" to method:scheduler resources', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(15 minutes)',
                method: METHOD_SCHEDULER,
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      }

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).toThrow(
        /inputPath.*not supported.*scheduler/i,
      )
    })

    it('should throw when passing "inputTransformer" to method:scheduler resources', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(15 minutes)',
                method: METHOD_SCHEDULER,
                inputTransformer: {
                  inputPathsMap: { eventTime: '$.time' },
                  inputTemplate: '{"time": <eventTime>}',
                },
              },
            },
          ],
        },
      }

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).toThrow(
        /inputTransformer.*not supported.*scheduler/i,
      )
    })

    it('should throw when passing "timezone" to method:eventBus resources', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(15 minutes)',
                method: METHOD_EVENT_BUS,
                timezone: 'America/New_York',
              },
            },
          ],
        },
      }

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).toThrow(
        /timezone.*only supported.*scheduler/i,
      )
    })

    it('should throw when passing "timezone" without method:scheduler', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(15 minutes)',
                timezone: 'America/New_York',
              },
            },
          ],
        },
      }

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).toThrow(
        /timezone.*only supported.*scheduler/i,
      )
    })

    it('should not create resources when no schedule events are given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileScheduledEvents.compileScheduledEvents()

      const resources =
        awsCompileScheduledEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const scheduleResources = Object.entries(resources).filter(
        ([, resource]) =>
          resource.Type === 'AWS::Events::Rule' ||
          resource.Type === 'AWS::Scheduler::Schedule',
      )

      expect(scheduleResources.length).toBe(0)
    })
  })
})
