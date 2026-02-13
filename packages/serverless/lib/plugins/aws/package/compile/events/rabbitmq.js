import _ from 'lodash'
import resolveLambdaTarget from '../../../utils/resolve-lambda-target.js'

class AwsCompileRabbitMQEvents {
  constructor(serverless) {
    this.serverless = serverless
    this.provider = this.serverless.getProvider('aws')

    this.hooks = {
      'package:compileEvents': async () => this.compileRabbitMQEvents(),
    }

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'rabbitmq', {
      description: `RabbitMQ event source mapping configuration.
@see https://www.serverless.com/framework/docs/providers/aws/events/rabbitmq
@example
rabbitmq:
  arn: arn:aws:mq:us-east-1:123456789:broker:my-broker:b-abc-123
  queue: my-queue
  basicAuthArn: arn:aws:secretsmanager:us-east-1:123456789:secret:my-secret`,
      type: 'object',
      properties: {
        arn: {
          description: `Amazon MQ (RabbitMQ) broker ARN.`,
          anyOf: [
            {
              type: 'string',
              pattern:
                'arn:[a-z-]+:mq:[a-z0-9-]+:\\d+:broker:[A-Za-z0-9/_+=.@-]+:b-[a-z0-9-]+',
            },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        basicAuthArn: {
          description: `Secrets Manager ARN containing RabbitMQ credentials.`,
          anyOf: [
            { $ref: '#/definitions/awsSecretsManagerArnString' },
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
        queue: {
          description: `Queue name to consume from.`,
          type: 'string',
        },
        virtualHost: {
          description: `RabbitMQ virtual host to connect to.`,
          type: 'string',
        },
        filterPatterns: { $ref: '#/definitions/filterPatterns' },
      },
      additionalProperties: false,
      required: ['basicAuthArn', 'arn', 'queue'],
    })
  }

  compileRabbitMQEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName)
      const cfTemplate =
        this.serverless.service.provider.compiledCloudFormationTemplate

      // It is required to add the following statement in order to be able to connect to RabbitMQ cluster
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

      const brokerStatement = {
        Effect: 'Allow',
        Action: ['mq:DescribeBroker'],
        Resource: [],
      }

      let hasMQEvent = false

      functionObj.events.forEach((event) => {
        if (!event.rabbitmq) return

        hasMQEvent = true
        const {
          basicAuthArn,
          arn,
          batchSize,
          maximumBatchingWindow,
          enabled,
          queue,
          virtualHost,
          filterPatterns,
        } = event.rabbitmq

        const mqEventLogicalId = this.provider.naming.getRabbitMQEventLogicalId(
          functionName,
          queue,
        )
        const dependsOn = [
          this.provider.resolveFunctionIamRoleResourceName(functionObj),
          _.get(functionObj.targetAlias, 'logicalId'),
        ].filter(Boolean)

        const sourceAccessConfigurations = [
          {
            Type: 'BASIC_AUTH',
            URI: basicAuthArn,
          },
        ]

        if (virtualHost) {
          sourceAccessConfigurations.push({
            Type: 'VIRTUAL_HOST',
            URI: virtualHost,
          })
        }

        const mqResource = {
          Type: 'AWS::Lambda::EventSourceMapping',
          DependsOn: dependsOn,
          Properties: {
            FunctionName: resolveLambdaTarget(functionName, functionObj),
            EventSourceArn: arn,
            Queues: [queue],
            SourceAccessConfigurations: sourceAccessConfigurations,
          },
        }

        if (batchSize) {
          mqResource.Properties.BatchSize = batchSize
        }

        if (maximumBatchingWindow) {
          mqResource.Properties.MaximumBatchingWindowInSeconds =
            maximumBatchingWindow
        }

        if (enabled != null) {
          mqResource.Properties.Enabled = enabled
        }

        if (filterPatterns) {
          mqResource.Properties.FilterCriteria = {
            Filters: filterPatterns.map((pattern) => ({
              Pattern: JSON.stringify(pattern),
            })),
          }
        }

        brokerStatement.Resource.push(arn)
        secretsManagerStatement.Resource.push(basicAuthArn)
        cfTemplate.Resources[mqEventLogicalId] = mqResource
      })

      // https://docs.aws.amazon.com/lambda/latest/dg/with-mq.html#events-mq-permissions
      if (cfTemplate.Resources.IamRoleLambdaExecution && hasMQEvent) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
            .PolicyDocument.Statement
        statement.push(secretsManagerStatement)
        statement.push(brokerStatement)
        statement.push(ec2Statement)
      }
    })
  }
}

export default AwsCompileRabbitMQEvents
