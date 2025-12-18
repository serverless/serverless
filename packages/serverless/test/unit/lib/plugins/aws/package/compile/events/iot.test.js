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
const { default: AwsCompileIoTEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/iot.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileIoTEvents', () => {
  let serverless
  let awsCompileIoTEvents

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
    awsCompileIoTEvents = new AwsCompileIoTEvents(serverless)
    awsCompileIoTEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileIoTEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileIoTEvents()', () => {
    it('should create corresponding resources when iot events are given', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
            {
              iot: {
                sql: "SELECT * FROM 'topic_2'",
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstIotTopicRule1.Type).toBe('AWS::IoT::TopicRule')
      expect(resources.FirstIotTopicRule2.Type).toBe('AWS::IoT::TopicRule')
      expect(resources.FirstIotTopicRule1.Properties.TopicRulePayload.Sql).toBe(
        "SELECT * FROM 'topic_1'",
      )
      expect(resources.FirstIotTopicRule2.Properties.TopicRulePayload.Sql).toBe(
        "SELECT * FROM 'topic_2'",
      )
    })

    it('should create Lambda permission resources', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstLambdaPermissionIotTopicRule1.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(
        resources.FirstLambdaPermissionIotTopicRule1.Properties.Action,
      ).toBe('lambda:InvokeFunction')
      expect(
        resources.FirstLambdaPermissionIotTopicRule1.Properties.Principal,
      ).toBe('iot.amazonaws.com')
    })

    it('should support enabled property', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstIotTopicRule1.Properties.TopicRulePayload.RuleDisabled,
      ).toBe(true)
    })

    it('should default enabled to true', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstIotTopicRule1.Properties.TopicRulePayload.RuleDisabled,
      ).toBe(false)
    })

    it('should support name property', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
                name: 'my-rule-name',
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstIotTopicRule1.Properties.RuleName).toBe(
        'my-rule-name',
      )
    })

    it('should support description property', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
                description: 'My IoT rule description',
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstIotTopicRule1.Properties.TopicRulePayload.Description,
      ).toBe('My IoT rule description')
    })

    it('should support sqlVersion property', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
                sqlVersion: '2016-03-23',
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstIotTopicRule1.Properties.TopicRulePayload
          .AwsIotSqlVersion,
      ).toBe('2016-03-23')
    })

    it('should create resources for multiple functions', () => {
      awsCompileIoTEvents.serverless.service.functions = {
        first: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_1'",
              },
            },
          ],
        },
        second: {
          events: [
            {
              iot: {
                sql: "SELECT * FROM 'topic_2'",
              },
            },
          ],
        },
      }

      awsCompileIoTEvents.compileIoTEvents()

      const resources =
        awsCompileIoTEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstIotTopicRule1).toBeDefined()
      expect(resources.SecondIotTopicRule1).toBeDefined()
    })
  })
})
