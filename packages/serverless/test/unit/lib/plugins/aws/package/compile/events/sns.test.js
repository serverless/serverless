import { jest } from '@jest/globals'

// Mock Utils
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

const { default: AwsProvider } = await import(
  '../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileSNSEvents } = await import(
  '../../../../../../../../lib/plugins/aws/package/compile/events/sns.js'
)
const { default: Serverless } = await import(
  '../../../../../../../../lib/serverless.js'
)

describe('AwsCompileSNSEvents', () => {
  let serverless
  let awsCompileSNSEvents

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = { log: jest.fn() }
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    const options = { region: 'us-east-1' }
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsCompileSNSEvents = new AwsCompileSNSEvents(serverless, options)
  })

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () => {
      expect(awsCompileSNSEvents.provider).toBeInstanceOf(AwsProvider)
    })
  })

  describe('#compileSNSEvents()', () => {
    it('should throw an error if SNS event type is not a string or an object', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: 42,
            },
          ],
        },
      }

      expect(() => awsCompileSNSEvents.compileSNSEvents()).toThrow(Error)
    })

    it('should create corresponding resources when SNS events are given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
                displayName: 'Display name for topic 1',
                filterPolicy: {
                  pet: ['dog', 'cat'],
                },
                filterPolicyScope: 'MessageBody',
              },
            },
            {
              sns: 'Topic2',
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.SNSTopicTopic1.Type).toBe('AWS::SNS::Topic')
      expect(resources.SNSTopicTopic2.Type).toBe('AWS::SNS::Topic')
      expect(resources.FirstLambdaPermissionTopic1SNS.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.FirstLambdaPermissionTopic2SNS.Type).toBe(
        'AWS::Lambda::Permission',
      )
      expect(resources.FirstSnsSubscriptionTopic1.Type).toBe(
        'AWS::SNS::Subscription',
      )
      expect(
        resources.FirstSnsSubscriptionTopic1.Properties.FilterPolicy,
      ).toEqual({
        pet: ['dog', 'cat'],
      })
      expect(
        resources.FirstSnsSubscriptionTopic1.Properties.FilterPolicyScope,
      ).toBe('MessageBody')
    })

    it('should allow SNS topic without displayName', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.SNSTopicTopic1.Properties).not.toHaveProperty(
        'DisplayName',
      )
    })

    it('should create corresponding resources when topic is defined in resources', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
                displayName: 'Display name for topic 1',
                filterPolicy: {
                  pet: ['dog', 'cat'],
                },
              },
            },
            {
              sns: 'Topic2',
            },
          ],
        },
      }

      Object.assign(
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources,
        {
          SNSTopicTopic2: {
            Type: 'AWS::SNS::Topic',
            Properties: {
              TopicName: 'Topic2',
              DisplayName: 'Display name for topic 2',
            },
          },
        },
      )

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Existing topic should not be overwritten
      expect(resources.SNSTopicTopic2.Properties.DisplayName).toBe(
        'Display name for topic 2',
      )
      // New topic should be created
      expect(resources.SNSTopicTopic1.Type).toBe('AWS::SNS::Topic')
    })

    it('should create an SNS topic when only arn is given as a string', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: 'arn:aws:sns:region:account:queueName',
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // When ARN is given, only subscription and permission are created, no topic
      expect(resources.FirstSnsSubscriptionQueueName).toBeDefined()
      expect(resources.FirstSnsSubscriptionQueueName.Type).toBe(
        'AWS::SNS::Subscription',
      )
      expect(resources.FirstSnsSubscriptionQueueName.Properties.TopicArn).toBe(
        'arn:aws:sns:region:account:queueName',
      )
    })

    it('should create the correct resources when arn is given in object format', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:region:account:myTopic',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstSnsSubscriptionMyTopic).toBeDefined()
      expect(resources.FirstSnsSubscriptionMyTopic.Type).toBe(
        'AWS::SNS::Subscription',
      )
      expect(resources.FirstSnsSubscriptionMyTopic.Properties.TopicArn).toBe(
        'arn:aws:sns:region:account:myTopic',
      )
      expect(resources.FirstLambdaPermissionMyTopicSNS).toBeDefined()
      expect(resources.FirstLambdaPermissionMyTopicSNS.Type).toBe(
        'AWS::Lambda::Permission',
      )
    })

    it('should support CloudFormation intrinsic functions for arn', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: { 'Fn::GetAtt': ['MyTopic', 'Arn'] },
                topicName: 'MyTopic',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstSnsSubscriptionMyTopic).toBeDefined()
      expect(resources.FirstSnsSubscriptionMyTopic.Properties.TopicArn).toEqual(
        {
          'Fn::GetAtt': ['MyTopic', 'Arn'],
        },
      )
    })

    it('should create subscription with redrivePolicy when deadLetterTargetArn is specified', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
                redrivePolicy: {
                  deadLetterTargetArn: 'arn:aws:sqs:region:account:dlq',
                },
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstSnsSubscriptionTopic1.Properties.RedrivePolicy,
      ).toEqual({
        deadLetterTargetArn: 'arn:aws:sqs:region:account:dlq',
      })
    })

    it('should create subscription with kmsMasterKeyId when specified', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
                kmsMasterKeyId: 'alias/aws/sns',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.SNSTopicTopic1.Properties.KmsMasterKeyId).toBe(
        'alias/aws/sns',
      )
    })

    it('should create single SNS topic when the same topic is referenced repeatedly', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [{ sns: 'Topic1' }],
        },
        second: {
          events: [{ sns: 'Topic1' }],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Only one topic resource should be created
      const topicResources = Object.keys(resources).filter(
        (key) => resources[key].Type === 'AWS::SNS::Topic',
      )
      expect(topicResources.length).toBe(1)
      expect(resources.SNSTopicTopic1).toBeDefined()
    })

    it('should not create corresponding resources when SNS events are not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(Object.keys(resources).length).toBe(0)
    })

    it('should throw an error when the arn is an object and the value is not a string', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: { invalid: 'object' },
              },
            },
          ],
        },
      }

      expect(() => awsCompileSNSEvents.compileSNSEvents()).toThrow()
    })

    it('should create SNS topic when both arn and topicName are given as object properties', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:us-east-1:123456789:my-topic',
                topicName: 'CustomTopicName',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should use topicName for resource naming
      expect(resources.FirstSnsSubscriptionCustomTopicName).toBeDefined()
      expect(
        resources.FirstSnsSubscriptionCustomTopicName.Properties.TopicArn,
      ).toBe('arn:aws:sns:us-east-1:123456789:my-topic')
    })

    it('should throw an error when arn object is given without topicName', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: { 'Fn::GetAtt': ['MyTopic', 'Arn'] },
              },
            },
          ],
        },
      }

      expect(() => awsCompileSNSEvents.compileSNSEvents()).toThrow()
    })

    it('should create SNS topic when arn, topicName, and filterPolicy are given as object', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:us-east-1:123456789:my-topic',
                topicName: 'MyTopic',
                filterPolicy: {
                  eventType: ['order_placed'],
                },
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstSnsSubscriptionMyTopic.Properties.FilterPolicy,
      ).toEqual({
        eventType: ['order_placed'],
      })
    })

    it('should link topic to corresponding dlq when redrivePolicy is defined with resource ref', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic1',
                redrivePolicy: {
                  deadLetterTargetRef: 'MyDLQ',
                },
              },
            },
          ],
        },
      }

      // Add the DLQ resource
      awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources.MyDLQ =
        {
          Type: 'AWS::SQS::Queue',
        }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(
        resources.FirstSnsSubscriptionTopic1.Properties.RedrivePolicy,
      ).toEqual({
        deadLetterTargetArn: { 'Fn::GetAtt': ['MyDLQ', 'Arn'] },
      })
    })

    it('should not throw error when other events are present', () => {
      awsCompileSNSEvents.serverless.service.functions = {
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

      expect(() => awsCompileSNSEvents.compileSNSEvents()).not.toThrow()
    })

    it('should throw an error when the event is an object and the topicName is not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                displayName: 'Display name for topic 1',
              },
            },
          ],
        },
      }

      expect(() => awsCompileSNSEvents.compileSNSEvents()).toThrow()
    })

    it('should create a cross region subscription when SNS topic arn in a different region than provider', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:eu-west-1:accountid:foo',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstSnsSubscriptionFoo.Type).toBe(
        'AWS::SNS::Subscription',
      )
      expect(resources.FirstSnsSubscriptionFoo.Properties.Region).toBe(
        'eu-west-1',
      )
    })

    it('should create a cross region subscription when SNS topic arn uses pseudo params', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                arn: 'arn:aws:sns:${AWS::Region}:${AWS::AccountId}:foo',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      expect(resources.FirstSnsSubscriptionFoo.Type).toBe(
        'AWS::SNS::Subscription',
      )
      expect(resources.FirstSnsSubscriptionFoo.Properties.Region).toBe(
        '${AWS::Region}',
      )
    })

    it('should override SNS topic subscription CF resource name when arn and topicName are given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'CustomName',
                arn: 'arn:aws:sns:us-east-1:accountid:original-name',
              },
            },
          ],
        },
      }

      awsCompileSNSEvents.compileSNSEvents()

      const resources =
        awsCompileSNSEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources

      // Should use topicName for the resource naming
      expect(resources.FirstSnsSubscriptionCustomName).toBeDefined()
      expect(resources.FirstSnsSubscriptionCustomName.Type).toBe(
        'AWS::SNS::Subscription',
      )
    })
  })
})
