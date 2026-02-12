import ServerlessError from '../../../../../serverless-error.js'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'
import _ from 'lodash'

class AwsCompileKafkaEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileKafkaEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'kafka', {
      description: `Self-managed Apache Kafka event configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/kafka
@see https://docs.aws.amazon.com/lambda/latest/dg/with-kafka.html
@remarks Self-managed Kafka event.
@example
events:
  - kafka:
      accessConfigurations:
        saslScram512Auth: arn:aws:secretsmanager:region:account:secret:name
      bootstrapServers:
        - broker1.example.com:9092
      topic: my-topic
      batchSize: 100`,
      type: 'object',
      properties: {
        accessConfigurations: {
          description: `Self-managed Kafka access configuration.`,
          type: 'object',
          minProperties: 1,
          properties: {
            vpcSubnet: {
              description: `VPC subnet ids used by the event source mapping.`,
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                pattern: 'subnet-[a-z0-9]+',
              },
            },
            vpcSecurityGroup: {
              description: `VPC security group ids used by the event source mapping.`,
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                pattern: 'sg-[a-z0-9]+',
              },
            },
            saslPlainAuth: {
              description: `Secrets Manager ARNs for SASL/PLAIN auth.`,
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            saslScram256Auth: {
              description: `Secrets Manager ARNs for SASL/SCRAM-256 auth.`,
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            saslScram512Auth: {
              description: `Secrets Manager ARNs for SASL/SCRAM-512 auth.`,
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            clientCertificateTlsAuth: {
              description: `Secrets Manager ARNs containing client TLS certificates.`,
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            serverRootCaCertificate: {
              description: `Secrets Manager ARNs containing server root CA certificates.`,
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
          },
          additionalProperties: false,
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
        bootstrapServers: {
          description: `Kafka bootstrap servers.`,
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
          },
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
          description: `Topic to consume from.`,
          type: 'string',
        },
        consumerGroupId: {
          description: `Consumer group ID for the Kafka consumer.`,
          type: 'string',
          maxLength: 200,
          pattern: '[a-zA-Z0-9-/*:_+=.@-]*',
        },
        filterPatterns: { $ref: '#/definitions/filterPatterns' },
      },
      additionalProperties: false,
      required: ['accessConfigurations', 'bootstrapServers', 'topic'],
    })
  }

  compileKafkaEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      const cfTemplate =
        this.serverless.service.provider.compiledCloudFormationTemplate

      // Collect Kafka events with their index and iterate from end to start.
      // Rationale:
      // - Historically, Kafka EventSourceMapping logical IDs were derived only from the topic
      //   (see getKafkaEventLogicalId). When multiple kafka events used the same topic (and often
      //   the same consumer group) but different clusters, they collided under one logical ID and
      //   effectively only the last event “won”.
      // - We must preserve backward compatibility for existing stacks. The mapping that previously
      //   “won” must keep the legacy (topic-only) logical ID to avoid resource replacement.
      // - For additional mappings for the same topic, we now append a short, deterministic hash
      //   derived from the source identity (sorted bootstrapServers + topic + consumerGroupId)
      //   to guarantee uniqueness without being impacted by property order.
      // - Reverse iteration naturally implements the “last-wins keeps legacy” rule without a
      //   pre-scan: the first time we see a base ID while walking from the end is the winner; any
      //   earlier duplicates get a suffixed ID.
      const kafkaEvents = functionObj.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => Boolean(event.kafka))
      const assignedBaseIds = new Set()

      // It is required to add the following statement in order to be able to connect to Kafka cluster
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

      // The omission of kms:Decrypt is intentional, since we won't know
      // which resources should be valid to decrypt.  It's also probably
      // not best practice to allow '*' for this.
      const secretsManagerStatement = {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [],
      }

      let hasKafkaEvent = false
      let needsEc2Permissions = false

      for (let i = kafkaEvents.length - 1; i >= 0; i--) {
        const { event } = kafkaEvents[i]

        const {
          accessConfigurations: { vpcSecurityGroup, vpcSubnet },
        } = event.kafka

        if (
          (vpcSecurityGroup && !vpcSubnet) ||
          (vpcSubnet && !vpcSecurityGroup)
        ) {
          const missing = vpcSecurityGroup ? 'vpcSubnet' : 'vpcSecurityGroup'
          throw new ServerlessError(
            `You must specify at least one "${missing}" accessConfiguration for function: ${functionName}`,
            'FUNCTION_KAFKA_VPC_ACCESS_CONFIGURATION_INVALID',
          )
        }

        hasKafkaEvent = true
        const {
          topic,
          batchSize,
          maximumBatchingWindow,
          enabled,
          consumerGroupId,
        } = event.kafka
        const startingPosition = event.kafka.startingPosition || 'TRIM_HORIZON'
        const startingPositionTimestamp = event.kafka.startingPositionTimestamp

        if (
          startingPosition === 'AT_TIMESTAMP' &&
          startingPositionTimestamp == null
        ) {
          throw new ServerlessError(
            `You must specify startingPositionTimestamp for function: ${functionName} when startingPosition is AT_TIMESTAMP.`,
            'FUNCTION_KAFKA_STARTING_POSITION_TIMESTAMP_INVALID',
          )
        }

        // Base logical ID uses topic only (legacy behavior, subject to collisions)
        const baseKafkaEventLogicalId =
          this.provider.naming.getKafkaEventLogicalId(functionName, topic)
        // If this base ID was already claimed by a later event, generate a
        // disambiguated ID using the identity hash; otherwise keep legacy.
        let kafkaEventLogicalId
        if (assignedBaseIds.has(baseKafkaEventLogicalId)) {
          kafkaEventLogicalId = this.provider.naming.getKafkaEventLogicalId(
            functionName,
            topic,
            consumerGroupId,
            event.kafka.bootstrapServers,
          )
        } else {
          assignedBaseIds.add(baseKafkaEventLogicalId)
          kafkaEventLogicalId = baseKafkaEventLogicalId
        }
        const dependsOn = [
          this.provider.resolveFunctionIamRoleResourceName(functionObj),
          _.get(functionObj.targetAlias, 'logicalId'),
        ].filter(Boolean)

        const kafkaResource = {
          Type: 'AWS::Lambda::EventSourceMapping',
          DependsOn: dependsOn,
          Properties: {
            FunctionName: resolveLambdaTarget(functionName, functionObj),
            StartingPosition: startingPosition,
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: event.kafka.bootstrapServers,
              },
            },
            Topics: [topic],
          },
        }

        kafkaResource.Properties.SourceAccessConfigurations = []
        Object.entries(event.kafka.accessConfigurations).forEach(
          ([accessConfigurationType, accessConfigurationValues]) => {
            let type
            let prefix = ''
            let needsSecretsManagerPermissions = false
            switch (accessConfigurationType) {
              case 'vpcSubnet':
                type = 'VPC_SUBNET'
                prefix = 'subnet:'
                needsEc2Permissions = true
                break
              case 'vpcSecurityGroup':
                type = 'VPC_SECURITY_GROUP'
                prefix = 'security_group:'
                needsEc2Permissions = true
                break
              case 'saslPlainAuth':
                type = 'BASIC_AUTH'
                needsSecretsManagerPermissions = true
                break
              case 'saslScram256Auth':
                type = 'SASL_SCRAM_256_AUTH'
                needsSecretsManagerPermissions = true
                break
              case 'saslScram512Auth':
                type = 'SASL_SCRAM_512_AUTH'
                needsSecretsManagerPermissions = true
                break
              case 'clientCertificateTlsAuth':
                type = 'CLIENT_CERTIFICATE_TLS_AUTH'
                needsSecretsManagerPermissions = true
                break
              case 'serverRootCaCertificate':
                type = 'SERVER_ROOT_CA_CERTIFICATE'
                needsSecretsManagerPermissions = true
                break
              default:
                type = accessConfigurationType
            }

            accessConfigurationValues.forEach((accessConfigurationValue) => {
              if (needsSecretsManagerPermissions) {
                secretsManagerStatement.Resource.push(accessConfigurationValue)
              }
              kafkaResource.Properties.SourceAccessConfigurations.push({
                Type: type,
                URI: `${prefix}${accessConfigurationValue}`,
              })
            })
          },
        )

        if (batchSize) {
          kafkaResource.Properties.BatchSize = batchSize
        }

        if (maximumBatchingWindow) {
          kafkaResource.Properties.MaximumBatchingWindowInSeconds =
            maximumBatchingWindow
        }

        if (enabled != null) {
          kafkaResource.Properties.Enabled = enabled
        }

        if (consumerGroupId) {
          kafkaResource.Properties.SelfManagedKafkaEventSourceConfig = {
            ConsumerGroupId: consumerGroupId,
          }
        }

        if (startingPositionTimestamp != null) {
          kafkaResource.Properties.StartingPositionTimestamp =
            startingPositionTimestamp
        }

        const filterPatterns = event.kafka.filterPatterns
        if (filterPatterns) {
          kafkaResource.Properties.FilterCriteria = {
            Filters: filterPatterns.map((pattern) => ({
              Pattern: JSON.stringify(pattern),
            })),
          }
        }

        cfTemplate.Resources[kafkaEventLogicalId] = kafkaResource
      }

      // https://docs.aws.amazon.com/lambda/latest/dg/smaa-permissions.html
      if (cfTemplate.Resources.IamRoleLambdaExecution && hasKafkaEvent) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
            .PolicyDocument.Statement
        if (secretsManagerStatement.Resource.length) {
          statement.push(secretsManagerStatement)
        }
        if (needsEc2Permissions) {
          statement.push(ec2Statement)
        }
      }
    })
  }
}

export default AwsCompileKafkaEvents
