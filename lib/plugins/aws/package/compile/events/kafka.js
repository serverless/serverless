'use strict';

const ServerlessError = require('../../../../../serverless-error');

class AwsCompileKafkaEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileKafkaEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'kafka', {
      type: 'object',
      properties: {
        accessConfigurations: {
          type: 'object',
          minProperties: 1,
          properties: {
            vpcSubnet: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                pattern: 'subnet-[a-z0-9]+',
              },
            },
            vpcSecurityGroup: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                pattern: 'sg-[a-z0-9]+',
              },
            },
            saslPlainAuth: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            saslScram256Auth: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            saslScram512Auth: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            clientCertificateTlsAuth: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
            serverRootCaCertificate: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/definitions/awsSecretsManagerArnString' },
            },
          },
          additionalProperties: false,
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
        bootstrapServers: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
          },
        },
        startingPosition: {
          type: 'string',
          enum: ['LATEST', 'TRIM_HORIZON'],
        },
        topic: {
          type: 'string',
        },
      },
      additionalProperties: false,
      required: ['accessConfigurations', 'bootstrapServers', 'topic'],
    });
  }

  compileKafkaEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

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
      };

      // The omission of kms:Decrypt is intentional, since we won't know
      // which resources should be valid to decrypt.  It's also probably
      // not best practice to allow '*' for this.
      const secretsManagerStatement = {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [],
      };

      let hasKafkaEvent = false;
      let needsEc2Permissions = false;

      functionObj.events.forEach((event) => {
        if (!event.kafka) return;

        const {
          accessConfigurations: {
            vpcSecurityGroup,
            vpcSubnet,
            clientCertificateTlsAuth,
            serverRootCaCertificate,
          },
        } = event.kafka;

        if ((vpcSecurityGroup && !vpcSubnet) || (vpcSubnet && !vpcSecurityGroup)) {
          const missing = vpcSecurityGroup ? 'vpcSubnet' : 'vpcSecurityGroup';
          throw new ServerlessError(
            `You must specify at least one "${missing}" accessConfiguration for function: ${functionName}`,
            'FUNCTION_KAFKA_VPC_ACCESS_CONFIGURATION_INVALID'
          );
        }

        if (serverRootCaCertificate && !clientCertificateTlsAuth) {
          throw new ServerlessError(
            `You cannot specify "serverRootCaCertificate" accessConfiguration without providing "clientCertificateTlsAuth" accessConfiguration for function: ${functionName}`,
            'FUNCTION_KAFKA_CLIENT_CERTIFICATE_TLS_AUTH_CONFIGURATION_MISSING'
          );
        }

        hasKafkaEvent = true;
        const { topic, batchSize, maximumBatchingWindow, enabled } = event.kafka;
        const startingPosition = event.kafka.startingPosition || 'TRIM_HORIZON';

        const kafkaEventLogicalId = this.provider.naming.getKafkaEventLogicalId(
          functionName,
          topic
        );
        const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
        const dependsOn = this.provider.resolveFunctionIamRoleResourceName(functionObj) || [];

        const kafkaResource = {
          Type: 'AWS::Lambda::EventSourceMapping',
          DependsOn: dependsOn,
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
            StartingPosition: startingPosition,
            SelfManagedEventSource: {
              Endpoints: { KafkaBootstrapServers: event.kafka.bootstrapServers },
            },
            Topics: [topic],
          },
        };

        kafkaResource.Properties.SourceAccessConfigurations = [];
        Object.entries(event.kafka.accessConfigurations).forEach(
          ([accessConfigurationType, accessConfigurationValues]) => {
            let type;
            let prefix = '';
            let needsSecretsManagerPermissions = false;
            switch (accessConfigurationType) {
              case 'vpcSubnet':
                type = 'VPC_SUBNET';
                prefix = 'subnet:';
                needsEc2Permissions = true;
                break;
              case 'vpcSecurityGroup':
                type = 'VPC_SECURITY_GROUP';
                prefix = 'security_group:';
                needsEc2Permissions = true;
                break;
              case 'saslPlainAuth':
                type = 'BASIC_AUTH';
                needsSecretsManagerPermissions = true;
                break;
              case 'saslScram256Auth':
                type = 'SASL_SCRAM_256_AUTH';
                needsSecretsManagerPermissions = true;
                break;
              case 'saslScram512Auth':
                type = 'SASL_SCRAM_512_AUTH';
                needsSecretsManagerPermissions = true;
                break;
              case 'clientCertificateTlsAuth':
                type = 'CLIENT_CERTIFICATE_TLS_AUTH';
                needsSecretsManagerPermissions = true;
                break;
              case 'serverRootCaCertificate':
                type = 'SERVER_ROOT_CA_CERTIFICATE';
                needsSecretsManagerPermissions = true;
                break;
              default:
                type = accessConfigurationType;
            }

            accessConfigurationValues.forEach((accessConfigurationValue) => {
              if (needsSecretsManagerPermissions) {
                secretsManagerStatement.Resource.push(accessConfigurationValue);
              }
              kafkaResource.Properties.SourceAccessConfigurations.push({
                Type: type,
                URI: `${prefix}${accessConfigurationValue}`,
              });
            });
          }
        );

        if (batchSize) {
          kafkaResource.Properties.BatchSize = batchSize;
        }

        if (maximumBatchingWindow) {
          kafkaResource.Properties.MaximumBatchingWindowInSeconds = maximumBatchingWindow;
        }

        if (enabled != null) {
          kafkaResource.Properties.Enabled = enabled;
        }

        cfTemplate.Resources[kafkaEventLogicalId] = kafkaResource;
      });

      // https://docs.aws.amazon.com/lambda/latest/dg/smaa-permissions.html
      if (cfTemplate.Resources.IamRoleLambdaExecution && hasKafkaEvent) {
        const statement =
          cfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument
            .Statement;
        if (secretsManagerStatement.Resource.length) {
          statement.push(secretsManagerStatement);
        }
        if (needsEc2Permissions) {
          statement.push(ec2Statement);
        }
      }
    });
  }
}

module.exports = AwsCompileKafkaEvents;
