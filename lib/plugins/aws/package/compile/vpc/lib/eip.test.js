'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileEip()', () => {
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

  it('should create an EIP resource', () => {
    return awsCompileVpc.compileEip().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        NatPublicIp: {
          Type: 'AWS::EC2::EIP',
          DependsOn: 'VPC',
          Properties: {
            Domain: 'vpc',
          },
        },
      });
    });
  });
});
