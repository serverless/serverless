'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileSubnets()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'eu-central-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    awsCompileVpc = new AwsCompileVpc(serverless, options);
  });

  it('should create Subnet resources based on the provided region', () => {
    return awsCompileVpc.compileSubnets().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        SubnetPrivateeucentral1a: {
          Type: 'AWS::EC2::Subnet',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
            CidrBlock: '10.0.1.0/24',
            AvailabilityZone: 'eu-central-1a',
            MapPublicIpOnLaunch: false,
            Tags: [
              {
                Key: 'Name',
                Value: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'Private',
                      'subnet',
                    ],
                  ],
                },
              },
            ],
          },
        },
        SubnetPubliceucentral1a: {
          Type: 'AWS::EC2::Subnet',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
            CidrBlock: '10.0.2.0/24',
            AvailabilityZone: 'eu-central-1a',
            MapPublicIpOnLaunch: false,
            Tags: [
              {
                Key: 'Name',
                Value: {
                  'Fn::Join': [
                    '-',
                    [
                      {
                        Ref: 'AWS::StackName',
                      },
                      'Public',
                      'subnet',
                    ],
                  ],
                },
              },
            ],
          },
        },
      });
    });
  });
});
