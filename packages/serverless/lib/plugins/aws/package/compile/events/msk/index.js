import getMskClusterNameToken from './get-msk-cluster-name-token.js'
import resolveLambdaTarget from '../../../../utils/resolve-lambda-target.js'
import ServerlessError from '../../../../../../serverless-error.js'
import _ from 'lodash'

class AwsCompileMSKEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileMSKEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'msk', {
      description: `Amazon MSK (Managed Streaming for Kafka) event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/msk
@remarks Amazon MSK event.
@example
msk:
  arn: arn:aws:kafka:us-east-1:123456789:cluster/my-cluster/abc-123
  topic: my-kafka-topic`,
      type: 'object',
      properties: {
        arn: {
          description: `MSK cluster ARN.`,
          anyOf: [
            { $ref: '#/definitions/awsArnString' },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        batchSize: {
          description: `Maximum number of records to retrieve in a single batch.`,
          type: 'number',
          minimum: 1,
          maximum: 10000,
        },
        maximumBatchingWindow: {
          description: `Maximum batching window in seconds.`,
          type: 'number',
          minimum: 0,
          maximum: 300,
        },
        enabled: {
          description: `Enable or disable the event source mapping.`,
          type: 'boolean',
        },
        startingPosition: {
          description: `Where Lambda starts reading in the stream.`,
          type: 'string',
          enum: ['LATEST', 'TRIM_HORIZON', 'AT_TIMESTAMP'],
        },
        startingPositionTimestamp: {
          description: `Start timestamp used when startingPosition is AT_TIMESTAMP.`,
          type: 'number',
        },
        topic: {
          description: `Kafka topic to consume from.
@example 'my-kafka-topic'`,
          type: 'string',
        },
        saslScram512: {
          description: `Secrets Manager ARN for SASL/SCRAM-512 auth.`,
          $ref: '#/definitions/awsArnString',
        },
        consumerGroupId: {
          description: `Kafka consumer group id for this mapping.`,
          type: 'string',
          maxLength: 200,
          pattern: '[a-zA-Z0-9-/*:_+=.@-]*',
        },
        filterPatterns: {
          description: `Event filter patterns.
@see https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html`,
          $ref: '#/definitions/filterPatterns',
        },
      },
      additionalProperties: false,
      required: ['arn', 'topic'],
    })
  }

  compileMSKEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      const cfTemplate =
        this.serverless.service.provider.compiledCloudFormationTemplate

      // It is required to add the following statement in order to be able to connect to MSK cluster
      const ec2Statement = {
        Effect: 'Allow',
        Action: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DescribeVpcs',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
        ],
        Resource: '*',
      }
      const mskStatement = {
        Effect: 'Allow',
        Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
        Resource: [],
      }

      functionObj.events.forEach((event) => {
        if (event.msk) {
          const eventSourceArn = event.msk.arn
          const topic = event.msk.topic
          const batchSize = event.msk.batchSize
          const maximumBatchingWindow = event.msk.maximumBatchingWindow
          const enabled = event.msk.enabled
          const startingPosition = event.msk.startingPosition || 'TRIM_HORIZON'
          const startingPositionTimestamp = event.msk.startingPositionTimestamp
          if (
            startingPosition === 'AT_TIMESTAMP' &&
            startingPositionTimestamp == null
          ) {
            throw new ServerlessError(
              `You must specify startingPositionTimestamp for function: ${functionName} when startingPosition is AT_TIMESTAMP.`,
              'FUNCTION_MSK_STARTING_POSITION_TIMESTAMP_INVALID',
            )
          }
          const saslScram512 = event.msk.saslScram512
          const consumerGroupId = event.msk.consumerGroupId
          const filterPatterns = event.msk.filterPatterns

          const mskClusterNameToken = getMskClusterNameToken(eventSourceArn)
          const mskEventLogicalId = this.provider.naming.getMSKEventLogicalId(
            functionName,
            mskClusterNameToken,
            topic,
          )

          const dependsOn = [
            this.provider.resolveFunctionIamRoleResourceName(functionObj),
            _.get(functionObj.targetAlias, 'logicalId'),
          ].filter(Boolean)

          const mskResource = {
            Type: 'AWS::Lambda::EventSourceMapping',
            DependsOn: dependsOn,
            Properties: {
              EventSourceArn: eventSourceArn,
              FunctionName: resolveLambdaTarget(functionName, functionObj),
              StartingPosition: startingPosition,
              Topics: [topic],
            },
          }

          if (startingPositionTimestamp != null) {
            mskResource.Properties.StartingPositionTimestamp =
              startingPositionTimestamp
          }

          if (batchSize) {
            mskResource.Properties.BatchSize = batchSize
          }

          if (maximumBatchingWindow) {
            mskResource.Properties.MaximumBatchingWindowInSeconds =
              maximumBatchingWindow
          }

          if (consumerGroupId) {
            mskResource.Properties.AmazonManagedKafkaEventSourceConfig = {
              ConsumerGroupId: consumerGroupId,
            }
          }

          if (enabled != null) {
            mskResource.Properties.Enabled = enabled
          }

          if (saslScram512 != null) {
            const secureAccessConfigurations = [
              {
                Type: 'SASL_SCRAM_512_AUTH',
                URI: saslScram512,
              },
            ]
            mskResource.Properties.SourceAccessConfigurations =
              secureAccessConfigurations
          }

          if (filterPatterns) {
            mskResource.Properties.FilterCriteria = {
              Filters: filterPatterns.map((pattern) => ({
                Pattern: JSON.stringify(pattern),
              })),
            }
          }

          mskStatement.Resource.push(eventSourceArn)

          cfTemplate.Resources[mskEventLogicalId] = mskResource
        }
      })

      if (cfTemplate.Resources.IamRoleLambdaExecution) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
            .PolicyDocument.Statement
        if (mskStatement.Resource.length) {
          statement.push(mskStatement)
          statement.push(ec2Statement)
        }
      }
    })
  }
}

export default AwsCompileMSKEvents
