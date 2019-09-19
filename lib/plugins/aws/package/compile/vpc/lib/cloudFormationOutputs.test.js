'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileCloudFormationOutputs()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        SubnetPublicfoo: {},
        SubnetPrivatebar: {},
        SubnetPublicbaz: {},
        SubnetPrivatequx: {},
      },
      Outputs: {},
    };

    awsCompileVpc = new AwsCompileVpc(serverless);
  });

  it('should create CloudFormation outputs', () => {
    return awsCompileVpc.compileCloudFormationOutputs().then(() => {
      const { Outputs } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Outputs).to.deep.equal({
        VPC: {
          Value: {
            Ref: 'VPC',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'VPC',
                ],
              ],
            },
          },
        },
        SubnetPublicfoo: {
          Value: {
            Ref: 'SubnetPublicfoo',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'SubnetPublicfoo',
                ],
              ],
            },
          },
        },
        SubnetPublicbaz: {
          Value: {
            Ref: 'SubnetPublicbaz',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'SubnetPublicbaz',
                ],
              ],
            },
          },
        },
        SubnetPrivatebar: {
          Value: {
            Ref: 'SubnetPrivatebar',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'SubnetPrivatebar',
                ],
              ],
            },
          },
        },
        SubnetPrivatequx: {
          Value: {
            Ref: 'SubnetPrivatequx',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'SubnetPrivatequx',
                ],
              ],
            },
          },
        },
        LambdaSecurityGroup: {
          Value: {
            Ref: 'LambdaSecurityGroup',
          },
          Export: {
            Name: {
              'Fn::Join': [
                '-',
                [
                  {
                    Ref: 'AWS::StackName',
                  },
                  'LambdaSecurityGroup',
                ],
              ],
            },
          },
        },
      });
    });
  });
});
