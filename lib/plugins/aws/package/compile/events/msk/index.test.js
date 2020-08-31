'use strict';

const AwsCompileMSKEvents = require('./index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

const runServerless = require('../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../tests/fixtures');

describe('AwsCompileMSKEvents', () => {
  after(fixtures.cleanup);

  const arn = 'arn:aws:kafka:us-east-1:111111111111:cluster/ClusterName/a1a1a1a1a1a1a1a1a';
  const topic = 'TestingTopic';

  describe('when using default parameters', () => {
    let eventSourceMappingResource;
    let defaultIamRole;
    let naming;

    before(() =>
      fixtures
        .extend('function', {
          functions: {
            foo: {
              events: [
                {
                  msk: {
                    topic,
                    arn,
                  },
                },
              ],
            },
          },
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            naming = awsNaming;
            eventSourceMappingResource =
              cfTemplate.Resources[
                naming.getMSKEventLogicalId('foo', 'ClusterName', 'TestingTopic')
              ].Properties;
            defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
          })
        )
    );

    it('should correctly compile EventSourceMapping resource', () => {
      expect(eventSourceMappingResource).to.deep.equal({
        BatchSize: 100,
        Enabled: true,
        EventSourceArn: arn,
        StartingPosition: 'TRIM_HORIZON',
        Topics: [topic],
        FunctionName: {
          'Fn::GetAtt': [naming.getLambdaLogicalId('foo'), 'Arn'],
        },
      });
    });

    it('should update default IAM role with MSK statement', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
        Resource: [arn],
      });
    });

    it('should update default IAM role with EC2 statement', () => {
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

  describe('when using all parameters', () => {
    it('should correctly compile EventSourceMapping resource', () => {
      const enabled = false;
      const startingPosition = 'LATEST';
      const batchSize = 5000;

      return fixtures
        .extend('function', {
          functions: {
            foo: {
              events: [
                {
                  msk: {
                    topic,
                    arn,
                    batchSize,
                    enabled,
                    startingPosition,
                  },
                },
              ],
            },
          },
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            const resource =
              cfTemplate.Resources[
                awsNaming.getMSKEventLogicalId('foo', 'ClusterName', 'TestingTopic')
              ].Properties;
            expect(resource).to.deep.equal({
              BatchSize: batchSize,
              Enabled: enabled,
              EventSourceArn: arn,
              StartingPosition: startingPosition,
              Topics: [topic],
              FunctionName: {
                'Fn::GetAtt': [awsNaming.getLambdaLogicalId('foo'), 'Arn'],
              },
            });
          })
        );
    });
  });
});

describe('getMSKClusterName', () => {
  let awsCompileMSKEvents;

  before(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileMSKEvents = new AwsCompileMSKEvents(serverless);
  });

  it('with ARN', () => {
    const eventSourceArn =
      'arn:aws:kafka:us-east-1:111111111111:cluster/ClusterName/a1a1a1a1a1a1a1a1a';
    const result = awsCompileMSKEvents.getMSKClusterName(eventSourceArn);
    expect(result).to.equal('ClusterName');
  });

  it('with Fn::ImportValue', () => {
    const eventSourceArn = { 'Fn::ImportValue': 'importvalue' };
    const result = awsCompileMSKEvents.getMSKClusterName(eventSourceArn);
    expect(result).to.equal('importvalue');
  });

  it('with Ref', () => {
    const eventSourceArn = { Ref: 'ReferencedResource' };
    const result = awsCompileMSKEvents.getMSKClusterName(eventSourceArn);
    expect(result).to.equal('ReferencedResource');
  });
});
