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
const { default: AwsCompileStreamEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/stream.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileStreamEvents', () => {
  let serverless
  let awsCompileStreamEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = { log: jest.fn() }
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
    serverless.setProvider(
      'aws',
      new AwsProvider(serverless, { region: 'us-east-1' }),
    )
    awsCompileStreamEvents = new AwsCompileStreamEvents(serverless)
    awsCompileStreamEvents.serverless.service.service = 'new-service'
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileStreamEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileStreamEvents()', () => {
    it('should not throw error if default policy is not present', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      }

      awsCompileStreamEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
        null

      expect(() => {
        awsCompileStreamEvents.compileStreamEvents()
      }).not.toThrow()
    })

    it('should create event source mapping for DynamoDB stream', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toBe(
        'arn:aws:dynamodb:region:account:table/foo/stream/1',
      )
    })

    it('should create event source mapping for Kinesis stream', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:kinesis:region:account:stream/foo',
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toBe(
        'arn:aws:kinesis:region:account:stream/foo',
      )
    })

    it('should support object notation with arn', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
    })

    it('should support batchSize property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                batchSize: 50,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.BatchSize).toBe(50)
    })

    it('should support startingPosition property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                startingPosition: 'TRIM_HORIZON',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.StartingPosition).toBe(
        'TRIM_HORIZON',
      )
    })

    it('should support enabled property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                enabled: false,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.Enabled).toBe(false)
    })

    it('should support Fn::GetAtt for arn', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: { 'Fn::GetAtt': ['MyDynamoDbTable', 'StreamArn'] },
                type: 'dynamodb',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual({
        'Fn::GetAtt': ['MyDynamoDbTable', 'StreamArn'],
      })
    })

    it('should add DynamoDB stream permissions to IAM role', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const iamRole = resources.IamRoleLambdaExecution
      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const dynamodbStatement = statements.find(
        (s) => s.Action && s.Action.includes('dynamodb:GetRecords'),
      )

      expect(dynamodbStatement).toBeDefined()
      expect(dynamodbStatement.Action).toContain('dynamodb:GetRecords')
      expect(dynamodbStatement.Action).toContain('dynamodb:GetShardIterator')
      expect(dynamodbStatement.Action).toContain('dynamodb:DescribeStream')
      expect(dynamodbStatement.Action).toContain('dynamodb:ListStreams')
    })

    it('should add Kinesis stream permissions to IAM role', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:kinesis:region:account:stream/foo',
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const iamRole = resources.IamRoleLambdaExecution
      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const kinesisStatement = statements.find(
        (s) => s.Action && s.Action.includes('kinesis:GetRecords'),
      )

      expect(kinesisStatement).toBeDefined()
      expect(kinesisStatement.Action).toContain('kinesis:GetRecords')
      expect(kinesisStatement.Action).toContain('kinesis:GetShardIterator')
      expect(kinesisStatement.Action).toContain('kinesis:DescribeStream')
      // Note: sf-core uses kinesis:ListStreams instead of kinesis:DescribeStreamSummary
      expect(kinesisStatement.Action).toContain('kinesis:ListStreams')
    })

    it('should create event source mappings for multiple functions', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
            },
          ],
        },
        second: {
          events: [
            {
              stream: 'arn:aws:kinesis:region:account:stream/bar',
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(2)
    })

    it('should support Fn::ImportValue for arn', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: { 'Fn::ImportValue': 'SharedDynamoDBStream' },
                type: 'dynamodb',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual({
        'Fn::ImportValue': 'SharedDynamoDBStream',
      })
    })

    it('should support Fn::Join for arn', () => {
      const arnWithJoin = {
        'Fn::Join': [
          ':',
          [
            'arn',
            'aws',
            'kinesis',
            { Ref: 'AWS::Region' },
            { Ref: 'AWS::AccountId' },
            'stream/mystream',
          ],
        ],
      }

      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: arnWithJoin,
                type: 'kinesis',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.EventSourceArn).toEqual(
        arnWithJoin,
      )
    })

    it('should support batchWindow property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                batchWindow: 60,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(
        eventSourceMappings[0][1].Properties.MaximumBatchingWindowInSeconds,
      ).toBe(60)
    })

    it('should support parallelizationFactor property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                parallelizationFactor: 5,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.ParallelizationFactor).toBe(5)
    })

    it('should support bisectBatchOnFunctionError property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                bisectBatchOnFunctionError: true,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(
        eventSourceMappings[0][1].Properties.BisectBatchOnFunctionError,
      ).toBe(true)
    })

    it('should support maximumRetryAttempts property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                maximumRetryAttempts: 3,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.MaximumRetryAttempts).toBe(3)
    })

    it('should support maximumRecordAgeInSeconds property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                maximumRecordAgeInSeconds: 120,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(
        eventSourceMappings[0][1].Properties.MaximumRecordAgeInSeconds,
      ).toBe(120)
    })

    it('should support functionResponseType property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                functionResponseType: 'ReportBatchItemFailures',
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(
        eventSourceMappings[0][1].Properties.FunctionResponseTypes,
      ).toEqual(['ReportBatchItemFailures'])
    })

    it('should support tumblingWindowInSeconds property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                tumblingWindowInSeconds: 300,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.TumblingWindowInSeconds).toBe(
        300,
      )
    })

    it('should not create resources when no stream events are given', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(0)
    })

    it('should not throw when other events are present', () => {
      awsCompileStreamEvents.serverless.service.functions = {
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

      expect(() => awsCompileStreamEvents.compileStreamEvents()).not.toThrow()
    })

    it('should create Kinesis stream consumer when consumer is true', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:kinesis:us-east-1:123456789012:stream/myStream',
                consumer: true,
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should create a StreamConsumer resource
      const consumerResources = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Kinesis::StreamConsumer',
      )

      expect(consumerResources.length).toBe(1)
      expect(consumerResources[0][1].Properties.StreamARN).toBe(
        'arn:aws:kinesis:us-east-1:123456789012:stream/myStream',
      )
    })

    it('should support onFailure destination with SNS ARN string', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                destinations: {
                  onFailure: 'arn:aws:sns:region:account:snstopic',
                },
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(
        eventSourceMappings[0][1].Properties.DestinationConfig.OnFailure
          .Destination,
      ).toBe('arn:aws:sns:region:account:snstopic')
    })

    it('should support onFailure destination with SQS ARN', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                destinations: {
                  onFailure: 'arn:aws:sqs:region:account:dlq',
                },
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(
        eventSourceMappings[0][1].Properties.DestinationConfig.OnFailure
          .Destination,
      ).toBe('arn:aws:sqs:region:account:dlq')
    })

    it('should support onFailure destination with object notation', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                destinations: {
                  onFailure: {
                    arn: 'arn:aws:sns:region:account:snstopic',
                    type: 'sns',
                  },
                },
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings.length).toBe(1)
      expect(
        eventSourceMappings[0][1].Properties.DestinationConfig.OnFailure
          .Destination,
      ).toBe('arn:aws:sns:region:account:snstopic')
    })

    it('should add SNS permissions for onFailure SNS destination', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                destinations: {
                  onFailure: 'arn:aws:sns:region:account:snstopic',
                },
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const iamRole = resources.IamRoleLambdaExecution
      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const snsStatement = statements.find(
        (s) => s.Action && s.Action.includes('sns:Publish'),
      )

      expect(snsStatement).toBeDefined()
    })

    it('should add SQS permissions for onFailure SQS destination', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                destinations: {
                  onFailure: 'arn:aws:sqs:region:account:dlq',
                },
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const iamRole = resources.IamRoleLambdaExecution
      const statements = iamRole.Properties.Policies[0].PolicyDocument.Statement

      const sqsStatement = statements.find(
        (s) => s.Action && s.Action.includes('sqs:SendMessage'),
      )

      expect(sqsStatement).toBeDefined()
    })

    it('should support filterPatterns property', () => {
      awsCompileStreamEvents.serverless.service.functions = {
        first: {
          events: [
            {
              stream: {
                arn: 'arn:aws:dynamodb:region:account:table/foo/stream/1',
                filterPatterns: [{ eventName: ['INSERT'] }],
              },
            },
          ],
        },
      }

      awsCompileStreamEvents.compileStreamEvents()

      const resources =
        awsCompileStreamEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      const eventSourceMappings = Object.entries(resources).filter(
        ([, resource]) => resource.Type === 'AWS::Lambda::EventSourceMapping',
      )

      expect(eventSourceMappings[0][1].Properties.FilterCriteria).toBeDefined()
      expect(
        eventSourceMappings[0][1].Properties.FilterCriteria.Filters,
      ).toBeDefined()
    })
  })
})
