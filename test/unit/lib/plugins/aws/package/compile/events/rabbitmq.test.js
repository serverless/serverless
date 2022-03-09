'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../utils/run-serverless');

const { expect } = chai;

chai.use(require('chai-as-promised'));

describe('test/unit/lib/plugins/aws/package/compile/events/rabbitmq.test.js', () => {
  const brokerArn = 'arn:aws:mq:us-east-1:0000:broker:ExampleMQBroker:b-xxx-xxx';
  const basicAuthArn = 'arn:aws:secretsmanager:us-east-1:01234567890:secret:MyBrokerSecretName';
  const queue = 'TestingQueue';
  const virtualHost = '/';
  const enabled = false;
  const batchSize = 5000;
  const maximumBatchingWindow = 20;

  describe('when there are rabbitmq events defined', () => {
    let minimalEventSourceMappingResource;
    let allParamsEventSourceMappingResource;
    let defaultIamRole;
    let naming;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              events: [
                {
                  rabbitmq: {
                    queue,
                    arn: brokerArn,
                    basicAuthArn,
                  },
                },
              ],
            },
            other: {
              events: [
                {
                  rabbitmq: {
                    queue,
                    virtualHost,
                    arn: brokerArn,
                    basicAuthArn,
                    batchSize,
                    maximumBatchingWindow,
                    enabled,
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
        cfTemplate.Resources[naming.getRabbitMQEventLogicalId('basic', queue)];
      allParamsEventSourceMappingResource =
        cfTemplate.Resources[naming.getRabbitMQEventLogicalId('other', queue)];
      defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
    });

    it('should correctly compile EventSourceMapping resource properties with minimal configuration', () => {
      expect(minimalEventSourceMappingResource.Properties).to.deep.equal({
        EventSourceArn: brokerArn,
        SourceAccessConfigurations: [
          {
            Type: 'BASIC_AUTH',
            URI: basicAuthArn,
          },
        ],
        Queues: [queue],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('basic'), 'Arn'],
        },
      });
    });

    it('should update default IAM role with DescribeBroker statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['mq:DescribeBroker'],
        Resource: [brokerArn],
      });
    });

    it('should update default IAM role with SecretsManager statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [basicAuthArn],
      });
    });

    it('should correctly compile EventSourceMapping resource DependsOn ', () => {
      expect(minimalEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
      expect(allParamsEventSourceMappingResource.DependsOn).to.equal('IamRoleLambdaExecution');
    });

    it('should correctly compile EventSourceMapping resource with all parameters', () => {
      expect(allParamsEventSourceMappingResource.Properties).to.deep.equal({
        EventSourceArn: brokerArn,
        BatchSize: batchSize,
        MaximumBatchingWindowInSeconds: maximumBatchingWindow,
        Enabled: enabled,
        SourceAccessConfigurations: [
          {
            Type: 'BASIC_AUTH',
            URI: basicAuthArn,
          },
          {
            Type: 'VIRTUAL_HOST',
            URI: virtualHost,
          },
        ],
        Queues: [queue],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('other'), 'Arn'],
        },
      });
    });

    it('should update default IAM role with EC2 statement', async () => {
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
  });

  describe('configuring rabbitmq events', () => {
    it('should not add dependsOn for imported role', async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              role: { 'Fn::ImportValue': 'MyImportedRole' },
              events: [
                {
                  rabbitmq: {
                    queue,
                    arn: brokerArn,
                    basicAuthArn,
                    virtualHost,
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });

      const eventSourceMappingResource =
        cfTemplate.Resources[awsNaming.getRabbitMQEventLogicalId('basic', queue)];
      expect(eventSourceMappingResource.DependsOn).to.deep.equal([]);
    });
  });

  describe('when no rabbitmq events are defined', () => {
    it('should not modify the default IAM role', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
      });

      const defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
        Effect: 'Allow',
        Action: ['mq:DescribeBroker'],
        Resource: [brokerArn],
      });

      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).not.to.deep.include({
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [basicAuthArn],
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
