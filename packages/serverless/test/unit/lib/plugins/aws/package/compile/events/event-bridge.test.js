import { jest, describe, beforeEach, it, expect } from '@jest/globals'

// Mock @serverless/util
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
    warning: jest.fn(),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
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

// Mock custom resources
jest.unstable_mockModule(
  '../../../../../../../../lib/plugins/aws/custom-resources/index.js',
  () => ({
    addCustomResourceToService: jest.fn(),
  }),
)

// Import after mocking
const { default: AwsCompileEventBridgeEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/event-bridge/index.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileEventBridgeEvents', () => {
  let serverless
  let awsCompileEventBridgeEvents
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
    serverless._logDeprecation = jest.fn()
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileEventBridgeEvents = new AwsCompileEventBridgeEvents(
      serverless,
      options,
    )
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileEventBridgeEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileEventBridgeEvents() - CloudFormation mode', () => {
    it('should create EventBridge Rule resource with schedule', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.ScheduleExpression).toBe('rate(10 minutes)')
      expect(rule.Properties.State).toBe('ENABLED')
    })

    it('should create EventBridge Rule resource with pattern', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                pattern: {
                  source: ['aws.cloudformation'],
                  'detail-type': ['AWS API Call via CloudTrail'],
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.EventPattern).toEqual({
        source: ['aws.cloudformation'],
        'detail-type': ['AWS API Call via CloudTrail'],
      })
    })

    it('should create Lambda Permission resource', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const permissions = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::Permission',
      )

      expect(permissions.length).toBe(1)
      const [, permission] = permissions[0]
      expect(permission.Properties.Principal).toBe('events.amazonaws.com')
      expect(permission.Properties.Action).toBe('lambda:InvokeFunction')
    })

    it('should create EventBus resource when non-default bus is specified', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'my-custom-event-bus',
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventBuses = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::EventBus',
      )

      expect(eventBuses.length).toBe(1)
      const [, eventBus] = eventBuses[0]
      expect(eventBus.Properties.Name).toBe('my-custom-event-bus')
    })

    it('should not create EventBus when using default bus', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'default',
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventBuses = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::EventBus',
      )

      expect(eventBuses.length).toBe(0)
    })

    it('should not create EventBus when using ARN', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'arn:aws:events:us-east-1:12345:event-bus/default',
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventBuses = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::EventBus',
      )

      expect(eventBuses.length).toBe(0)
    })

    it('should support enabled: false', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.State).toBe('DISABLED')
    })

    it('should support custom rule name', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                name: 'my-custom-rule',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Name).toBe('my-custom-rule')
    })

    it('should support description', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                description: 'My Event Rule description',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Description).toBe('My Event Rule description')
    })

    it('should support input configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                input: {
                  key1: 'value1',
                  key2: { nested: 'value2' },
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Targets[0].Input).toBe(
        JSON.stringify({ key1: 'value1', key2: { nested: 'value2' } }),
      )
    })

    it('should support inputPath configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Targets[0].InputPath).toBe('$.stageVariables')
    })

    it('should support inputTransformer configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                inputTransformer: {
                  inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                  inputPathsMap: {
                    eventTime: '$.time',
                  },
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Targets[0].InputTransformer).toBeDefined()
      expect(rule.Properties.Targets[0].InputTransformer.InputTemplate).toBe(
        '{"time": <eventTime>, "key1": "value1"}',
      )
    })

    it('should support retryPolicy configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                retryPolicy: {
                  maximumEventAge: 7200,
                  maximumRetryAttempts: 9,
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Targets[0].RetryPolicy).toEqual({
        MaximumEventAgeInSeconds: 7200,
        MaximumRetryAttempts: 9,
      })
    })

    it('should support deadLetterQueueArn configuration', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                deadLetterQueueArn: 'arn:aws:sqs:us-east-1:123456789:my-dlq',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.Targets[0].DeadLetterConfig).toEqual({
        Arn: 'arn:aws:sqs:us-east-1:123456789:my-dlq',
      })
    })

    it('should support $or pattern', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                pattern: {
                  $or: [
                    { detail: { eventSource: ['saas.external'] } },
                    { source: ['aws.cloudformation'] },
                  ],
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.EventPattern.$or).toHaveLength(2)
    })

    it('should throw error when multiple input properties are set', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                input: { key: 'value' },
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileEventBridgeEvents.compileEventBridgeEvents(),
      ).toThrow(/only set one of input, inputPath, or inputTransformer/)
    })

    it('should support CF intrinsic functions for eventBus', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: { Ref: 'ImportedEventBus' },
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventBuses = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::EventBus',
      )

      // Should not create new event bus when using CF intrinsic
      expect(eventBuses.length).toBe(0)
    })

    it('should create rule that depends on EventBus when bus is created', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: 'my-custom-event-bus',
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.DependsOn).toBeDefined()
    })

    it('should not create resources when no eventBridge events', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ sns: 'myTopic' }],
        },
      }

      expect(() =>
        awsCompileEventBridgeEvents.compileEventBridgeEvents(),
      ).not.toThrow()
    })

    it('should support multiple eventBridge events for same function', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
              },
            },
            {
              eventBridge: {
                schedule: 'rate(1 hour)',
              },
            },
            {
              eventBridge: {
                pattern: {
                  source: ['aws.ec2'],
                },
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(3)
    })

    it('should support cron expression', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'cron(0 12 * * ? *)',
              },
            },
          ],
        },
      }

      awsCompileEventBridgeEvents.compileEventBridgeEvents()

      const resources =
        awsCompileEventBridgeEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const rules = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Events::Rule',
      )

      expect(rules.length).toBe(1)
      const [, rule] = rules[0]
      expect(rule.Properties.ScheduleExpression).toBe('cron(0 12 * * ? *)')
    })
  })

  describe('#compileEventBridgeEvents() - Custom Resources mode (legacy)', () => {
    beforeEach(() => {
      awsCompileEventBridgeEvents.serverless.service.provider.eventBridge = {
        useCloudFormation: false,
      }
    })

    it('should throw error when retryPolicy is set with custom resources', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                retryPolicy: {
                  maximumEventAge: 7200,
                  maximumRetryAttempts: 9,
                },
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileEventBridgeEvents.compileEventBridgeEvents(),
      ).toThrow(/RetryPolicy.*not supported.*Custom Resources/)
    })

    it('should throw error when deadLetterQueueArn is set with custom resources', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                schedule: 'rate(10 minutes)',
                deadLetterQueueArn: 'arn:aws:sqs:us-east-1:123456789:my-dlq',
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileEventBridgeEvents.compileEventBridgeEvents(),
      ).toThrow(/DeadLetterConfig.*not supported.*Custom Resources/)
    })

    it('should throw error when eventBus is CF intrinsic with custom resources', () => {
      awsCompileEventBridgeEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              eventBridge: {
                eventBus: { Ref: 'ImportedEventBus' },
                schedule: 'rate(10 minutes)',
              },
            },
          ],
        },
      }

      expect(() =>
        awsCompileEventBridgeEvents.compileEventBridgeEvents(),
      ).toThrow(
        /CloudFormation intrinsic functions.*not supported.*Custom Resources/,
      )
    })
  })
})
