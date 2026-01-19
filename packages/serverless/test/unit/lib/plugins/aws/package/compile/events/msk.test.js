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

// Import after mocking
const { default: AwsCompileMSKEvents } =
  await import('../../../../../../../../lib/plugins/aws/package/compile/events/msk/index.js')
const { default: AwsProvider } =
  await import('../../../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../../../lib/serverless.js')

describe('AwsCompileMSKEvents', () => {
  let serverless
  let awsCompileMSKEvents
  let options

  const mskArn =
    'arn:aws:kafka:us-east-1:111111111111:cluster/ClusterName/a1a1a1a1a1a1a1a1a'
  const topic = 'TestingTopic'
  const saslScram512Arn =
    'arn:aws:secretsmanager:us-east-1:111111111111:secret:AmazonMSK_a1a1a1a1a1a1a1a1'

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
    }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
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
    awsCompileMSKEvents = new AwsCompileMSKEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileMSKEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileMSKEvents()', () => {
    it('should create EventSourceMapping resource with minimal configuration', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const resources =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      const [, esm] = eventSourceMappings[0]
      expect(esm.Properties.EventSourceArn).toBe(mskArn)
      expect(esm.Properties.Topics).toEqual([topic])
      expect(esm.Properties.StartingPosition).toBe('TRIM_HORIZON')
    })

    it('should create EventSourceMapping resource with all parameters', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
                batchSize: 5000,
                maximumBatchingWindow: 10,
                enabled: false,
                startingPosition: 'LATEST',
                saslScram512: saslScram512Arn,
                consumerGroupId: 'TestConsumerGroupId',
                filterPatterns: [{ value: { a: [1, 2] } }],
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const resources =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      const [, esm] = eventSourceMappings[0]
      expect(esm.Properties.BatchSize).toBe(5000)
      expect(esm.Properties.MaximumBatchingWindowInSeconds).toBe(10)
      expect(esm.Properties.Enabled).toBe(false)
      expect(esm.Properties.StartingPosition).toBe('LATEST')
      expect(esm.Properties.SourceAccessConfigurations).toEqual([
        { Type: 'SASL_SCRAM_512_AUTH', URI: saslScram512Arn },
      ])
      expect(
        esm.Properties.AmazonManagedKafkaEventSourceConfig.ConsumerGroupId,
      ).toBe('TestConsumerGroupId')
      expect(esm.Properties.FilterCriteria).toBeDefined()
    })

    it('should add MSK IAM statement to default role', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const iamRole =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const mskStatement = statements.find(
        (s) =>
          s.Action &&
          s.Action.includes('kafka:DescribeCluster') &&
          s.Action.includes('kafka:GetBootstrapBrokers'),
      )
      expect(mskStatement).toBeDefined()
      expect(mskStatement.Resource).toContain(mskArn)
    })

    it('should add EC2 IAM statement to default role', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const iamRole =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const ec2Statement = statements.find(
        (s) =>
          s.Action &&
          s.Action.includes('ec2:CreateNetworkInterface') &&
          s.Action.includes('ec2:DescribeVpcs'),
      )
      expect(ec2Statement).toBeDefined()
      expect(ec2Statement.Resource).toBe('*')
    })

    it('should set DependsOn to IamRoleLambdaExecution', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const resources =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      const [, esm] = eventSourceMappings[0]
      expect(esm.DependsOn).toContain('IamRoleLambdaExecution')
    })

    it('should support startingPositionTimestamp with AT_TIMESTAMP', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
                startingPosition: 'AT_TIMESTAMP',
                startingPositionTimestamp: 123456789,
              },
            },
          ],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const resources =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      const [, esm] = eventSourceMappings[0]
      expect(esm.Properties.StartingPosition).toBe('AT_TIMESTAMP')
      expect(esm.Properties.StartingPositionTimestamp).toBe(123456789)
    })

    it('should throw error when AT_TIMESTAMP without startingPositionTimestamp', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              msk: {
                arn: mskArn,
                topic: topic,
                startingPosition: 'AT_TIMESTAMP',
              },
            },
          ],
        },
      }

      expect(() => awsCompileMSKEvents.compileMSKEvents()).toThrow(
        /startingPositionTimestamp/,
      )
    })

    it('should not create resources when no msk events are given', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const resources =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() => awsCompileMSKEvents.compileMSKEvents()).not.toThrow()
    })

    it('should not modify IAM role when no msk events', () => {
      awsCompileMSKEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      awsCompileMSKEvents.compileMSKEvents()

      const iamRole =
        awsCompileMSKEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      expect(statements.length).toBe(0)
    })
  })
})
