'use strict';

const getMskClusterNameToken = require('./get-msk-cluster-name-token');

class AwsCompileMSKEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileMSKEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'msk', {
      type: 'object',
      properties: {
        arn: {
          anyOf: [
            { $ref: '#/definitions/awsArnString' },
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
        startingPosition: {
          type: 'string',
          enum: ['LATEST', 'TRIM_HORIZON'],
        },
        topic: {
          type: 'string',
        },
        saslScram512: { $ref: '#/definitions/awsArnString' },
        consumerGroupId: {
          type: 'string',
          maxLength: 200,
          pattern: '[a-zA-Z0-9-/*:_+=.@-]*',
        },
        filterPatterns: { $ref: '#/definitions/filterPatterns' },
      },
      additionalProperties: false,
      required: ['arn', 'topic'],
    });
  }

  compileMSKEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

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
      };
      const mskStatement = {
        Effect: 'Allow',
        Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
        Resource: [],
      };

      functionObj.events.forEach((event) => {
        if (event.msk) {
          const eventSourceArn = event.msk.arn;
          const topic = event.msk.topic;
          const batchSize = event.msk.batchSize;
          const maximumBatchingWindow = event.msk.maximumBatchingWindow;
          const enabled = event.msk.enabled;
          const startingPosition = event.msk.startingPosition || 'TRIM_HORIZON';
          const saslScram512 = event.msk.saslScram512;
          const consumerGroupId = event.msk.consumerGroupId;
          const filterPatterns = event.msk.filterPatterns;

          const mskClusterNameToken = getMskClusterNameToken(eventSourceArn);
          const mskEventLogicalId = this.provider.naming.getMSKEventLogicalId(
            functionName,
            mskClusterNameToken,
            topic
          );

          const dependsOn = this.provider.resolveFunctionIamRoleResourceName(functionObj) || [];

          const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

          const mskResource = {
            Type: 'AWS::Lambda::EventSourceMapping',
            DependsOn: dependsOn,
            Properties: {
              EventSourceArn: eventSourceArn,
              FunctionName: {
                'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
              },
              StartingPosition: startingPosition,
              Topics: [topic],
            },
          };

          if (batchSize) {
            mskResource.Properties.BatchSize = batchSize;
          }

          if (maximumBatchingWindow) {
            mskResource.Properties.MaximumBatchingWindowInSeconds = maximumBatchingWindow;
          }

          if (consumerGroupId) {
            mskResource.Properties.AmazonManagedKafkaEventSourceConfig = {
              ConsumerGroupId: consumerGroupId,
            };
          }

          if (enabled != null) {
            mskResource.Properties.Enabled = enabled;
          }

          if (saslScram512 != null) {
            const secureAccessConfigurations = [
              {
                Type: 'SASL_SCRAM_512_AUTH',
                URI: saslScram512,
              },
            ];
            mskResource.Properties.SourceAccessConfigurations = secureAccessConfigurations;
          }

          if (filterPatterns) {
            mskResource.Properties.FilterCriteria = {
              Filters: filterPatterns.map((pattern) => ({
                Pattern: JSON.stringify(pattern),
              })),
            };
          }

          mskStatement.Resource.push(eventSourceArn);

          cfTemplate.Resources[mskEventLogicalId] = mskResource;
        }
      });

      if (cfTemplate.Resources.IamRoleLambdaExecution) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
            .Statement;
        if (mskStatement.Resource.length) {
          statement.push(mskStatement);
          statement.push(ec2Statement);
        }
      }
    });
  }
}

module.exports = AwsCompileMSKEvents;
