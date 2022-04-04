'use strict';

class AwsCompileRabbitMQEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileRabbitMQEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'rabbitmq', {
      type: 'object',
      properties: {
        arn: {
          anyOf: [
            {
              type: 'string',
              pattern: 'arn:[a-z-]+:mq:[a-z0-9-]+:\\d+:broker:[A-Za-z0-9/_+=.@-]+:b-[a-z0-9-]+',
            },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        basicAuthArn: {
          anyOf: [
            { $ref: '#/definitions/awsSecretsManagerArnString' },
            { $ref: '#/definitions/awsCfImport' },
            { $ref: '#/definitions/awsCfRef' },
          ],
        },
        batchSize: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
        },
        maximumBatchingWindow: {
          type: 'number',
          minimum: 0,
          maximum: 300,
        },
        enabled: {
          type: 'boolean',
        },
        queue: {
          type: 'string',
        },
        virtualHost: {
          type: 'string',
        },
      },
      additionalProperties: false,
      required: ['basicAuthArn', 'arn', 'queue'],
    });
  }

  compileRabbitMQEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

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
      };

      // The omission of kms:Decrypt is intentional, since we won't know
      // which resources should be valid to decrypt.  It's also probably
      // not best practice to allow '*' for this.
      const secretsManagerStatement = {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [],
      };

      const brokerStatement = {
        Effect: 'Allow',
        Action: ['mq:DescribeBroker'],
        Resource: [],
      };

      let hasMQEvent = false;

      functionObj.events.forEach((event) => {
        if (!event.rabbitmq) return;

        hasMQEvent = true;
        const { basicAuthArn, arn, batchSize, maximumBatchingWindow, enabled, queue, virtualHost } =
          event.rabbitmq;

        const mqEventLogicalId = this.provider.naming.getRabbitMQEventLogicalId(
          functionName,
          queue
        );
        const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
        const dependsOn = this.provider.resolveFunctionIamRoleResourceName(functionObj) || [];

        const sourceAccessConfigurations = [
          {
            Type: 'BASIC_AUTH',
            URI: basicAuthArn,
          },
        ];

        if (virtualHost) {
          sourceAccessConfigurations.push({
            Type: 'VIRTUAL_HOST',
            URI: virtualHost,
          });
        }

        const mqResource = {
          Type: 'AWS::Lambda::EventSourceMapping',
          DependsOn: dependsOn,
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            EventSourceArn: arn,
            Queues: [queue],
            SourceAccessConfigurations: sourceAccessConfigurations,
          },
        };

        if (batchSize) {
          mqResource.Properties.BatchSize = batchSize;
        }

        if (maximumBatchingWindow) {
          mqResource.Properties.MaximumBatchingWindowInSeconds = maximumBatchingWindow;
        }

        if (enabled != null) {
          mqResource.Properties.Enabled = enabled;
        }

        brokerStatement.Resource.push(arn);
        secretsManagerStatement.Resource.push(basicAuthArn);
        cfTemplate.Resources[mqEventLogicalId] = mqResource;
      });

      // https://docs.aws.amazon.com/lambda/latest/dg/with-mq.html#events-mq-permissions
      if (cfTemplate.Resources.IamRoleLambdaExecution && hasMQEvent) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
            .Statement;
        statement.push(secretsManagerStatement);
        statement.push(brokerStatement);
        statement.push(ec2Statement);
      }
    });
  }
}

module.exports = AwsCompileRabbitMQEvents;
