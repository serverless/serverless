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
const { default: AwsCompileActiveMQEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/activemq.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileActiveMQEvents', () => {
  let serverless
  let awsCompileActiveMQEvents

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
    awsCompileActiveMQEvents = new AwsCompileActiveMQEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileActiveMQEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileActiveMQEvents()', () => {
    it('should create EventSourceMapping resource with minimal configuration', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const resources =
        awsCompileActiveMQEvents.serverless.service.provider
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

    it('should create EventSourceMapping resource with all parameters', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
                batchSize: 5000,
                maximumBatchingWindow: 20,
                enabled: false,
                filterPatterns: [{ value: { a: [1, 2] } }],
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const resources =
        awsCompileActiveMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.BatchSize).toBe(5000)
      expect(mapping.Properties.MaximumBatchingWindowInSeconds).toBe(20)
      expect(mapping.Properties.Enabled).toBe(false)
      expect(mapping.Properties.FilterCriteria).toEqual({
        Filters: [{ Pattern: JSON.stringify({ value: { a: [1, 2] } }) }],
      })
    })

    it('should add IAM statements for mq:DescribeBroker', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const iamRole =
        awsCompileActiveMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const mqStatement = statements.find((s) =>
        s.Action.includes('mq:DescribeBroker'),
      )

      expect(mqStatement).toBeDefined()
      expect(mqStatement.Resource).toContain(brokerArn)
    })

    it('should add IAM statements for secretsmanager:GetSecretValue', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const iamRole =
        awsCompileActiveMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const secretsStatement = statements.find((s) =>
        s.Action.includes('secretsmanager:GetSecretValue'),
      )

      expect(secretsStatement).toBeDefined()
      expect(secretsStatement.Resource).toContain(basicAuthArn)
    })

    it('should add IAM statements for EC2 network interfaces', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const iamRole =
        awsCompileActiveMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const ec2Statement = statements.find((s) =>
        s.Action.includes('ec2:CreateNetworkInterface'),
      )

      expect(ec2Statement).toBeDefined()
      expect(ec2Statement.Resource).toBe('*')
    })

    it('should not create resources when no activemq events are given', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const resources =
        awsCompileActiveMQEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() =>
        awsCompileActiveMQEvents.compileActiveMQEvents(),
      ).not.toThrow()
    })

    it('should add DependsOn for IamRoleLambdaExecution', () => {
      awsCompileActiveMQEvents.serverless.service.functions = {
        first: {
          events: [
            {
              activemq: {
                queue,
                arn: brokerArn,
                basicAuthArn,
              },
            },
          ],
        },
      }

      awsCompileActiveMQEvents.compileActiveMQEvents()

      const resources =
        awsCompileActiveMQEvents.serverless.service.provider
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
