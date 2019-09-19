'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileVpc()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    awsCompileVpc = new AwsCompileVpc(serverless);
  });

  it('should create a VPC resource', () => {
    return awsCompileVpc.compileVpc().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        VPC: {
          Type: 'AWS::EC2::VPC',
          Properties: {
            CidrBlock: '10.0.0.0/16',
            EnableDnsSupport: true,
            EnableDnsHostnames: true,
            InstanceTenancy: 'default',
            Tags: [
              {
                Key: 'Name',
                Value: {
                  Ref: 'AWS::StackName',
                },
              },
            ],
          },
        },
      });
    });
  });
});
