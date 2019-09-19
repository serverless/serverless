'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileLambdaSecurityGroup()', () => {
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

  it('should create a Lambda SecurityGroup resource', () => {
    return awsCompileVpc.compileLambdaSecurityGroup().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        LambdaSecurityGroup: {
          Type: 'AWS::EC2::SecurityGroup',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
            GroupDescription: 'SecurityGroup for Serverless Functions',
          },
        },
      });
    });
  });
});
