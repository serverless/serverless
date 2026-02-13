import _ from 'lodash'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'
import ServerlessError from '../../../../../serverless-error.js'

class AwsCompileStreamEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      initialize: () => {
        if (
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some(({ stream: eventObject }) => {
              const consumer = eventObject && eventObject.consumer
              const usesServiceSpecificNamingMode =
                this.serverless.service.provider.kinesis &&
                this.serverless.service.provider.kinesis.consumerNamingMode &&
                _.get(
                  this.serverless,
                  'service.provider.kinesis.consumerNamingMode',
                ) === 'serviceSpecific'
              return consumer && !usesServiceSpecificNamingMode
            }),
          )
        ) {
          this.serverless._logDeprecation(
            'KINESIS_CONSUMER_NAME_CONTAINING_SERVICE',
            'Starting with v4.0.0 Kinesis streams naming scheme will change. Adapt to new schema by setting`provider.kinesis.consumerNamingMode` property to `serviceSpecific`.',
          )
        }
      },
      'package:compileEvents': async () => this.compileStreamEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'stream', {
      description: `DynamoDB/Kinesis stream event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/streams
@remarks Stream ARN or CloudFormation reference.
@remarks Stream type.
@example
events:
  - stream:
      arn: arn:aws:dynamodb:region:account:table/name/stream/timestamp
      type: dynamodb
      batchSize: 100
      startingPosition: LATEST
      functionResponseType: ReportBatchItemFailures`,
      anyOf: [
        { $ref: '#/definitions/awsArnString' },
        {
          type: 'object',
          properties: {
            // arn constraints are listed in oneOf property of this schema
            arn: {
              description: `Stream ARN or CloudFormation reference.
@example 'arn:aws:dynamodb:us-east-1:123456789:table/my-table/stream/2024-01-01T00:00:00.000'`,
            },
            type: {
              description: `Stream type.
@example 'dynamodb'`,
              enum: ['dynamodb', 'kinesis'],
            },
            batchSize: {
              description: `Number of records per batch.
@default 10`,
              type: 'integer',
              minimum: 1,
              maximum: 10000,
            },
            parallelizationFactor: {
              description: `Number of concurrent batches per shard (1-10).
@default 1`,
              type: 'integer',
              minimum: 1,
              maximum: 10,
            },
            startingPosition: {
              description: `Where to start reading.
@default 'TRIM_HORIZON'
@example 'LATEST' | 'TRIM_HORIZON'`,
              enum: ['LATEST', 'TRIM_HORIZON', 'AT_TIMESTAMP'],
            },
            startingPositionTimestamp: {
              description: `Start timestamp used when startingPosition is AT_TIMESTAMP.`,
              type: 'number',
            },
            enabled: {
              description: `Enable or disable the event source mapping.
@default true`,
              type: 'boolean',
            },
            consumer: {
              description: `Kinesis consumer config (true for managed consumer, or consumer ARN).`,
              anyOf: [{ const: true }, { $ref: '#/definitions/awsArn' }],
            },
            batchWindow: {
              description: `Maximum batching window in seconds.`,
              type: 'integer',
              minimum: 0,
              maximum: 300,
            },
            maximumRetryAttempts: {
              description: `Maximum retry attempts before discarding a batch.`,
              type: 'integer',
              minimum: -1,
              maximum: 10000,
            },
            bisectBatchOnFunctionError: {
              description: `Split batch in half when function returns an error.`,
              type: 'boolean',
            },
            maximumRecordAgeInSeconds: {
              description: `Maximum record age before records are discarded.`,
              anyOf: [
                { const: -1 },
                { type: 'integer', minimum: 60, maximum: 604800 },
              ],
            },
            functionResponseType: {
              description: `Enable partial batch item failure response mode.`,
              enum: ['ReportBatchItemFailures'],
            },
            destinations: {
              description: `Destination configuration for failed batches.`,
              type: 'object',
              properties: {
                onFailure: {
                  description: `Destination target for failed batch records.`,
                  anyOf: [
                    { $ref: '#/definitions/awsArnString' },
                    {
                      type: 'object',
                      properties: {
                        // arn constraints are listed in oneOf property of this schema
                        arn: {},
                        type: { enum: ['sns', 'sqs'] },
                      },
                      additionalProperties: false,
                      anyOf: [
                        {
                          properties: {
                            arn: { $ref: '#/definitions/awsCfFunction' },
                          },
                          required: ['arn', 'type'],
                        },
                        {
                          properties: {
                            arn: { $ref: '#/definitions/awsArnString' },
                          },
                          required: ['arn'],
                        },
                      ],
                    },
                  ],
                },
              },
              additionalProperties: false,
              required: ['onFailure'],
            },
            tumblingWindowInSeconds: {
              description: `Tumbling window duration in seconds for aggregation.`,
              type: 'integer',
              minimum: 0,
              maximum: 900,
            },
            filterPatterns: {
              description: `Event filter patterns.
@see https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html`,
              $ref: '#/definitions/filterPatterns',
            },
          },
          additionalProperties: false,
          anyOf: [
            {
              properties: {
                arn: { $ref: '#/definitions/awsCfFunction' },
              },
              required: ['arn', 'type'],
            },
            {
              properties: {
                arn: { $ref: '#/definitions/awsArnString' },
              },
              required: ['arn'],
            },
          ],
        },
      ],
    })
  }

  compileStreamEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)

      if (functionObj.events) {
        const dynamodbStreamStatement = {
          Effect: 'Allow',
          Action: [
            'dynamodb:GetRecords',
            'dynamodb:GetShardIterator',
            'dynamodb:DescribeStream',
            'dynamodb:ListStreams',
          ],
          Resource: [],
        }
        const kinesisStreamStatement = {
          Effect: 'Allow',
          Action: [
            'kinesis:GetRecords',
            'kinesis:GetShardIterator',
            'kinesis:DescribeStream',
            'kinesis:ListStreams',
          ],
          Resource: [],
        }
        const kinesisStreamWithConsumerStatement = {
          Effect: 'Allow',
          Action: [
            'kinesis:GetRecords',
            'kinesis:GetShardIterator',
            'kinesis:DescribeStreamSummary',
            'kinesis:ListShards',
          ],
          Resource: [],
        }
        const kinesisConsumerStatement = {
          Effect: 'Allow',
          Action: ['kinesis:SubscribeToShard'],
          Resource: [],
        }
        const onFailureSnsStatement = {
          Effect: 'Allow',
          Action: ['sns:Publish'],
          Resource: [],
        }
        const onFailureSqsStatement = {
          Effect: 'Allow',
          Action: ['sqs:ListQueues', 'sqs:SendMessage'],
          Resource: [],
        }

        functionObj.events.forEach((event) => {
          if (event.stream) {
            let EventSourceArn
            let BatchSize = 10
            let ParallelizationFactor
            let StartingPosition = 'TRIM_HORIZON'
            let Enabled = true

            if (typeof event.stream === 'object') {
              EventSourceArn = event.stream.arn
              BatchSize = event.stream.batchSize || BatchSize
              if (event.stream.parallelizationFactor) {
                ParallelizationFactor = event.stream.parallelizationFactor
              }
              StartingPosition =
                event.stream.startingPosition || StartingPosition

              if (typeof event.stream.enabled !== 'undefined') {
                Enabled = event.stream.enabled
              }
            } else {
              EventSourceArn = event.stream
            }

            const streamType = event.stream.type || EventSourceArn.split(':')[2]
            const streamName = (function () {
              if (EventSourceArn['Fn::GetAtt']) {
                return EventSourceArn['Fn::GetAtt'][0]
              } else if (EventSourceArn['Fn::ImportValue']) {
                return EventSourceArn['Fn::ImportValue']
              } else if (EventSourceArn.Ref) {
                return EventSourceArn.Ref
              } else if (EventSourceArn['Fn::Join']) {
                // [0] is the used delimiter, [1] is the array with values
                const name = EventSourceArn['Fn::Join'][1].slice(-1).pop()
                if (name.split('/').length) {
                  return name.split('/').pop()
                }
                return name
              }
              return EventSourceArn.split('/')[1]
            })()

            const streamLogicalId = this.provider.naming.getStreamLogicalId(
              functionName,
              streamType,
              streamName,
            )

            const dependsOn = []
            const functionIamRoleResourceName =
              this.provider.resolveFunctionIamRoleResourceName(functionObj)
            if (functionIamRoleResourceName) {
              dependsOn.push(functionIamRoleResourceName)
            }
            const { targetAlias } =
              this.serverless.service.functions[functionName]
            if (targetAlias) {
              dependsOn.push(targetAlias.logicalId)
            }

            const streamResource = {
              Type: 'AWS::Lambda::EventSourceMapping',
              DependsOn: dependsOn,
              Properties: {
                BatchSize,
                Enabled,
                EventSourceArn,
                FunctionName: resolveLambdaTarget(functionName, functionObj),
                ParallelizationFactor,
                StartingPosition,
              },
            }

            // add event source ARNs to PolicyDocument statements
            if (streamType === 'dynamodb') {
              dynamodbStreamStatement.Resource.push(EventSourceArn)
            } else if (event.stream.consumer) {
              kinesisStreamWithConsumerStatement.Resource.push(EventSourceArn)
            } else {
              kinesisStreamStatement.Resource.push(EventSourceArn)
            }

            if (event.stream.batchWindow != null) {
              streamResource.Properties.MaximumBatchingWindowInSeconds =
                event.stream.batchWindow
            }

            if (event.stream.maximumRetryAttempts != null) {
              streamResource.Properties.MaximumRetryAttempts =
                event.stream.maximumRetryAttempts
            }

            if (event.stream.bisectBatchOnFunctionError != null) {
              streamResource.Properties.BisectBatchOnFunctionError =
                event.stream.bisectBatchOnFunctionError
            }

            if (event.stream.functionResponseType != null) {
              streamResource.Properties.FunctionResponseTypes = [
                event.stream.functionResponseType,
              ]
            }

            if (event.stream.maximumRecordAgeInSeconds) {
              streamResource.Properties.MaximumRecordAgeInSeconds =
                event.stream.maximumRecordAgeInSeconds
            }

            if (event.stream.tumblingWindowInSeconds != null) {
              streamResource.Properties.TumblingWindowInSeconds =
                event.stream.tumblingWindowInSeconds
            }

            if (event.stream.destinations) {
              let OnFailureDestinationArn

              if (typeof event.stream.destinations.onFailure === 'object') {
                OnFailureDestinationArn =
                  event.stream.destinations.onFailure.arn
              } else {
                OnFailureDestinationArn = event.stream.destinations.onFailure
              }

              const destinationType =
                event.stream.destinations.onFailure.type ||
                OnFailureDestinationArn.split(':')[2]
              // add on failure destination ARNs to PolicyDocument statements
              if (destinationType === 'sns') {
                onFailureSnsStatement.Resource.push(OnFailureDestinationArn)
              } else {
                onFailureSqsStatement.Resource.push(OnFailureDestinationArn)
              }

              streamResource.Properties.DestinationConfig = {
                OnFailure: {
                  Destination: OnFailureDestinationArn,
                },
              }
            }

            if (event.stream.filterPatterns) {
              streamResource.Properties.FilterCriteria = {
                Filters: event.stream.filterPatterns.map((pattern) => ({
                  Pattern: JSON.stringify(pattern),
                })),
              }
            }

            const newStreamObject = {
              [streamLogicalId]: streamResource,
            }

            if (event.stream.consumer && streamType === 'kinesis') {
              if (event.stream.consumer === true) {
                const consumerName = this.provider.naming.getStreamConsumerName(
                  functionName,
                  streamName,
                )
                const consumerResource = {
                  Type: 'AWS::Kinesis::StreamConsumer',
                  Properties: {
                    StreamARN: EventSourceArn,
                    ConsumerName: consumerName,
                  },
                }
                const consumerLogicalId =
                  this.provider.naming.getStreamConsumerLogicalId(consumerName)
                newStreamObject[consumerLogicalId] = consumerResource
                if (Array.isArray(streamResource.DependsOn)) {
                  streamResource.DependsOn.push(consumerLogicalId)
                } else {
                  streamResource.DependsOn = [
                    streamResource.DependsOn,
                    consumerLogicalId,
                  ]
                }
                const consumerArnRef = {
                  Ref: consumerLogicalId,
                }
                streamResource.Properties.EventSourceArn = consumerArnRef
                kinesisConsumerStatement.Resource.push(consumerArnRef)
              } else {
                const consumerArn = event.stream.consumer
                streamResource.Properties.EventSourceArn = consumerArn
                kinesisConsumerStatement.Resource.push(consumerArn)
              }

              if (
                event.stream.startingPosition === 'AT_TIMESTAMP' &&
                !event.stream.startingPositionTimestamp
              ) {
                throw new ServerlessError(
                  `You must specify startingPositionTimestamp for function: ${functionName} when startingPosition is AT_TIMESTAMP`,
                  'FUNCTION_STREAM_STARTING_POSITION_TIMESTAMP_INVALID',
                )
              }

              if (event.stream.startingPositionTimestamp) {
                streamResource.Properties.StartingPositionTimestamp =
                  event.stream.startingPositionTimestamp
              }
            }

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources,
              newStreamObject,
            )
          }
        })

        // update the PolicyDocument statements (if default policy is used)
        if (
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution
        ) {
          const statement =
            this.serverless.service.provider.compiledCloudFormationTemplate
              .Resources.IamRoleLambdaExecution.Properties.Policies[0]
              .PolicyDocument.Statement
          if (dynamodbStreamStatement.Resource.length) {
            statement.push(dynamodbStreamStatement)
          }
          if (kinesisStreamStatement.Resource.length) {
            statement.push(kinesisStreamStatement)
          }
          if (kinesisStreamWithConsumerStatement.Resource.length) {
            statement.push(kinesisStreamWithConsumerStatement)
          }
          if (kinesisConsumerStatement.Resource.length) {
            statement.push(kinesisConsumerStatement)
          }
          if (onFailureSnsStatement.Resource.length) {
            statement.push(onFailureSnsStatement)
          }
          if (onFailureSqsStatement.Resource.length) {
            statement.push(onFailureSqsStatement)
          }
        }
      }
    })
  }
}

export default AwsCompileStreamEvents
