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

// Import after mocking
const { default: AwsCompileRabbitMQEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/rabbitmq.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileRabbitMQEvents', () => {
  let serverless
  let awsCompileRabbitMQEvents

  const brokerArn = 'arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx'
  const basicAuthArn =
    'arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName'
  const queue = 'TestingQueue'

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        IamRoleLambdaExecution: {
          Properties: {
            Policies: [
              {
                PolicyDocument: {
                  Statement: [],
                },
              },
            ],
          },
        },
      },
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileRabbitMQEvents = new AwsCompileRabbitMQEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileRabbitMQEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileRabbitMQEvents()', () => {
    it('should create EventSourceMapping resource with minimal configuration', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const resources =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.EventSourceArn).toBe(brokerArn)
      expect(mapping.Properties.Queues).toEqual([queue])
      expect(mapping.Properties.SourceAccessConfigurations).toEqual([
        { Type: 'BASIC_AUTH', URI: basicAuthArn },
      ])
    })

    it('should create EventSourceMapping resource with all parameters including virtualHost', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
                virtualHost: '/',
                batchSize: 5000,
                maximumBatchingWindow: 20,
                enabled: false,
                filterPatterns: [{ value: { a: [1, 2] } }],
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const resources =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.BatchSize).toBe(5000)
      expect(mapping.Properties.MaximumBatchingWindowInSeconds).toBe(20)
      expect(mapping.Properties.Enabled).toBe(false)
      // Should include both BASIC_AUTH and VIRTUAL_HOST
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'BASIC_AUTH',
        URI: basicAuthArn,
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VIRTUAL_HOST',
        URI: '/',
      })
    })

    it('should add IAM statements for mq:DescribeBroker', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const iamRole =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const mqStatement = statements.find((s) =>
        s.Action.includes('mq:DescribeBroker'),
      )

      expect(mqStatement).toBeDefined()
      expect(mqStatement.Resource).toContain(brokerArn)
    })

    it('should add IAM statements for secretsmanager:GetSecretValue', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const iamRole =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const secretsStatement = statements.find((s) =>
        s.Action.includes('secretsmanager:GetSecretValue'),
      )

      expect(secretsStatement).toBeDefined()
      expect(secretsStatement.Resource).toContain(basicAuthArn)
    })

    it('should add IAM statements for EC2 network interfaces', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const iamRole =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const ec2Statement = statements.find((s) =>
        s.Action.includes('ec2:CreateNetworkInterface'),
      )

      expect(ec2Statement).toBeDefined()
      expect(ec2Statement.Resource).toBe('*')
    })

    it('should not create resources when no rabbitmq events are given', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const resources =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() =>
        awsCompileRabbitMQEvents.compileRabbitMQEvents(),
      ).not.toThrow()
    })

    it('should add DependsOn for IamRoleLambdaExecution', () => {
      awsCompileRabbitMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              rabbitmq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileRabbitMQEvents.compileRabbitMQEvents()

      const resources =
        awsCompileRabbitMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.DependsOn).toContain('IamRoleLambdaExecution')
    })
  })
})
