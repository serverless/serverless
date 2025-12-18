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
const { default: AwsCompileKafkaEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/kafka.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileKafkaEvents', () => {
  let serverless
  let awsCompileKafkaEvents

  const saslScram256AuthArn =
    'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram256Auth'
  const topic = 'TestingTopic'
  const bootstrapServers = ['abc.xyz:9092']

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
    awsCompileKafkaEvents = new AwsCompileKafkaEvents(serverless)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileKafkaEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileKafkaEvents()', () => {
    it('should create EventSourceMapping resource with minimal configuration', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SelfManagedEventSource).toEqual({
        Endpoints: {
          KafkaBootstrapServers: bootstrapServers,
        },
      })
      expect(mapping.Properties.Topics).toEqual([topic])
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'SASL_SCRAM_256_AUTH',
        URI: saslScram256AuthArn,
      })
    })

    it('should create EventSourceMapping resource with all parameters', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
                batchSize: 5000,
                maximumBatchingWindow: 20,
                enabled: false,
                startingPosition: 'LATEST',
                filterPatterns: [{ eventName: 'INSERT' }],
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.BatchSize).toBe(5000)
      expect(mapping.Properties.MaximumBatchingWindowInSeconds).toBe(20)
      expect(mapping.Properties.Enabled).toBe(false)
      expect(mapping.Properties.StartingPosition).toBe('LATEST')
      expect(mapping.Properties.FilterCriteria).toEqual({
        Filters: [{ Pattern: JSON.stringify({ eventName: 'INSERT' }) }],
      })
    })

    it('should support multiple access configuration types', () => {
      const clientCertificateTlsAuthArn =
        'arn:aws:secretsmanager:us-east-1:01234567890:secret:clientCertificateTlsAuth'

      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  clientCertificateTlsAuth: [clientCertificateTlsAuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'SASL_SCRAM_256_AUTH',
        URI: saslScram256AuthArn,
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'CLIENT_CERTIFICATE_TLS_AUTH',
        URI: clientCertificateTlsAuthArn,
      })
    })

    it('should add IAM statements for secretsmanager:GetSecretValue', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const iamRole =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const secretsStatement = statements.find((s) =>
        s.Action.includes('secretsmanager:GetSecretValue'),
      )

      expect(secretsStatement).toBeDefined()
      expect(secretsStatement.Resource).toContain(saslScram256AuthArn)
    })

    it('should add IAM statements for EC2 network interfaces when VPC configured', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  vpcSubnet: ['subnet-1'],
                  vpcSecurityGroup: ['sg-1'],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const iamRole =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution

      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement
      const ec2Statement = statements.find((s) =>
        s.Action.includes('ec2:CreateNetworkInterface'),
      )

      expect(ec2Statement).toBeDefined()
      expect(ec2Statement.Resource).toBe('*')
    })

    it('should support VPC configuration with subnets and security groups', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  vpcSubnet: ['subnet-1', 'subnet-2'],
                  vpcSecurityGroup: ['sg-1'],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SUBNET',
        URI: 'subnet:subnet-1',
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SUBNET',
        URI: 'subnet:subnet-2',
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SECURITY_GROUP',
        URI: 'security_group:sg-1',
      })
    })

    it('should default startingPosition to TRIM_HORIZON', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.StartingPosition).toBe('TRIM_HORIZON')
    })

    it('should not create resources when no kafka events are given', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [{ http: { method: 'get', path: '/' } }],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [{ schedule: 'rate(1 minute)' }],
        },
      }

      expect(() => awsCompileKafkaEvents.compileKafkaEvents()).not.toThrow()
    })

    it('should add DependsOn for IamRoleLambdaExecution', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.DependsOn).toContain('IamRoleLambdaExecution')
    })

    it('should throw error when VPC_SUBNET provided without VPC_SECURITY_GROUP', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  vpcSubnet: ['subnet-1'],
                },
              },
            },
          ],
        },
      }

      expect(() => awsCompileKafkaEvents.compileKafkaEvents()).toThrow(
        /vpcSecurityGroup/,
      )
    })

    it('should throw error when VPC_SECURITY_GROUP provided without VPC_SUBNET', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  vpcSecurityGroup: ['sg-1'],
                },
              },
            },
          ],
        },
      }

      expect(() => awsCompileKafkaEvents.compileKafkaEvents()).toThrow(
        /vpcSubnet/,
      )
    })

    it('should support SASL_SCRAM_512_AUTH access configuration', () => {
      const saslScram512AuthArn =
        'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram512Auth'

      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram512Auth: [saslScram512AuthArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'SASL_SCRAM_512_AUTH',
        URI: saslScram512AuthArn,
      })
    })

    it('should support SERVER_ROOT_CA_CERTIFICATE access configuration', () => {
      const serverRootCaCertificateArn =
        'arn:aws:secretsmanager:us-east-1:01234567890:secret:ServerRootCaCert'

      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  serverRootCaCertificate: [serverRootCaCertificateArn],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'SERVER_ROOT_CA_CERTIFICATE',
        URI: serverRootCaCertificateArn,
      })
    })

    it('should support consumerGroupId configuration', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                },
                consumerGroupId: 'my-consumer-group',
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(
        mapping.Properties.SelfManagedKafkaEventSourceConfig.ConsumerGroupId,
      ).toBe('my-consumer-group')
    })

    it('should support multiple VPC subnets', () => {
      awsCompileKafkaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              kafka: {
                topic,
                bootstrapServers,
                accessConfigurations: {
                  saslScram256Auth: [saslScram256AuthArn],
                  vpcSubnet: ['subnet-1', 'subnet-2', 'subnet-3'],
                  vpcSecurityGroup: ['sg-1'],
                },
              },
            },
          ],
        },
      }

      awsCompileKafkaEvents.compileKafkaEvents()

      const resources =
        awsCompileKafkaEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, r]) => r.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings).toHaveLength(1)
      const [, mapping] = eventSourceMappings[0]
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SUBNET',
        URI: 'subnet:subnet-1',
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SUBNET',
        URI: 'subnet:subnet-2',
      })
      expect(mapping.Properties.SourceAccessConfigurations).toContainEqual({
        Type: 'VPC_SUBNET',
        URI: 'subnet:subnet-3',
      })
    })
  })
})
