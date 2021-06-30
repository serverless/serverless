'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../utils/run-serverless');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/plugins/aws/package/compile/events/kafka.test.js', () => {
  const saslScram256AuthArn =
    'arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName';
  const topic = 'TestingTopic';
  const enabled = false;
  const startingPosition = 'LATEST';
  const batchSize = 5000;

  describe('when there are kafka events defined', () => {
    let minimalEventSourceMappingResource;
    let allParamsEventSourceMappingResource;
    let defaultIamRole;
    let naming;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  kafka: {
                    topic,
                    bootstrapServers: ['abc.xyz:9092'],
                    accessConfigurations: { saslScram256Auth: saslScram256AuthArn },
                  },
                },
              ],
            },
            other: {
              events: [
                {
                  kafka: {
                    topic,
                    bootstrapServers: ['abc.xyz:9092'],
                    accessConfigurations: { saslScram256Auth: saslScram256AuthArn },
                    batchSize,
                    enabled,
                    startingPosition,
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      naming = awsNaming;
      minimalEventSourceMappingResource =
        cfTemplate.Resources[naming.getKafkaEventLogicalId('foo', 'TestingTopic')];
      allParamsEventSourceMappingResource =
        cfTemplate.Resources[naming.getKafkaEventLogicalId('other', 'TestingTopic')];
      defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
    });

    it('should correctly compile EventSourceMapping resource properties with minimal configuration', () => {
      expect(minimalEventSourceMappingResource.Properties).to.deep.equal({
        SelfManagedEventSource: {
          Endpoints: {
            KafkaBootstrapServers: ['abc.xyz:9092'],
          },
        },
        SourceAccessConfigurations: [
          {
            Type: 'SASL_SCRAM_256_AUTH',
            URI: saslScram256AuthArn,
          },
        ],
        StartingPosition: 'TRIM_HORIZON',
        Topics: [topic],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('foo'), 'Arn'],
        },
      });
    });

    it('should update default IAM role with SecretsManager statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [saslScram256AuthArn],
      });
    });

    it('should correctly compile EventSourceMapping resource DependsOn ', () => {
      expect(minimalEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
      expect(allParamsEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
    });

    it('should correctly compile EventSourceMapping resource with all parameters', () => {
      expect(allParamsEventSourceMappingResource.Properties).to.deep.equal({
        BatchSize: batchSize,
        Enabled: enabled,
        SelfManagedEventSource: {
          Endpoints: {
            KafkaBootstrapServers: ['abc.xyz:9092'],
          },
        },
        SourceAccessConfigurations: [
          {
            Type: 'SASL_SCRAM_256_AUTH',
            URI: saslScram256AuthArn,
          },
        ],
        StartingPosition: startingPosition,
        Topics: [topic],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('other'), 'Arn'],
        },
      });
    });
  });

  describe('configuring kafka events', () => {
    const runCompileEventSourceMappingTest = async (eventConfig) => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  kafka: eventConfig.event,
                },
              ],
            },
          },
        },
        command: 'package',
      });

      const eventSourceMappingResource =
        cfTemplate.Resources[awsNaming.getKafkaEventLogicalId('foo', 'TestingTopic')];
      expect(eventSourceMappingResource.Properties).to.deep.equal(eventConfig.resource(awsNaming));
    };

    it('should correctly compile EventSourceMapping resource properties for VPC_SECURITY_GROUP', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: { vpcSecurityGroup: 'sg-abc4567890' },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'VPC_SECURITY_GROUP',
                URI: 'security_group:sg-abc4567890',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for VPC_SUBNET', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: { vpcSubnet: 'subnet-abc4567890' },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'VPC_SUBNET',
                URI: 'subnet:subnet-abc4567890',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for multiple VPC_SUBNETs', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: { vpcSubnet: ['subnet-0011001100', 'subnet-0022002200'] },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'VPC_SUBNET',
                URI: 'subnet:subnet-0011001100',
              },
              {
                Type: 'VPC_SUBNET',
                URI: 'subnet:subnet-0022002200',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for SASL_PLAIN_AUTH', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: {
            saslPlainAuth:
              'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslPlainSecretName',
          },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'BASIC_AUTH',
                URI: 'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslPlainSecretName',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for SASL_SCRAM_256_AUTH', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: { saslScram256Auth: saslScram256AuthArn },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'SASL_SCRAM_256_AUTH',
                URI: saslScram256AuthArn,
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for SASL_SCRAM_256_AUTH', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: {
            saslScram256Auth:
              'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram256SecretName',
          },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'SASL_SCRAM_256_AUTH',
                URI: 'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram256SecretName',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should correctly compile EventSourceMapping resource properties for SASL_SCRAM_512_AUTH', async () => {
      const eventConfig = {
        event: {
          topic,
          bootstrapServers: ['abc.xyz:9092'],
          accessConfigurations: {
            saslScram512Auth:
              'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram512SecretName',
          },
        },
        resource: (awsNaming) => {
          return {
            SelfManagedEventSource: {
              Endpoints: {
                KafkaBootstrapServers: ['abc.xyz:9092'],
              },
            },
            SourceAccessConfigurations: [
              {
                Type: 'SASL_SCRAM_512_AUTH',
                URI: 'arn:aws:secretsmanager:us-east-1:01234567890:secret:SaslScram512SecretName',
              },
            ],
            StartingPosition: 'TRIM_HORIZON',
            Topics: [topic],
            FunctionName: {
              'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
            },
          };
        },
      };
      await runCompileEventSourceMappingTest(eventConfig);
    });

    it('should update default IAM role with EC2 statement', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  kafka: {
                    topic,
                    bootstrapServers: ['abc.xyz:9092'],
                    accessConfigurations: { vpcSecurityGroup: 'sg-abc4567890' },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      const defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
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
      });
    });

    it('should not add dependsOn for imported role', async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              role: { 'Fn::ImportValue': 'MyImportedRole' },
              events: [
                {
                  kafka: {
                    topic,
                    bootstrapServers: ['abc.xyz:9092'],
                    accessConfigurations: { saslScram256Auth: saslScram256AuthArn },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });

      const eventSourceMappingResource =
        cfTemplate.Resources[awsNaming.getKafkaEventLogicalId('foo', 'TestingTopic')];
      expect(eventSourceMappingResource.DependsOn).to.deep.equal([]);
    });
  });

  describe('when no kafka events are defined', () => {
    it('should not modify the default IAM role', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
      });

      const defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [saslScram256AuthArn],
      });

      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
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
      });
    });
  });
});
