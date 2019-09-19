'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileVpcGatewayAttachment()', () => {
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

  it('should create a VPCGatewayAttachment resource', () => {
    return awsCompileVpc.compileVpcGatewayAttachment().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        VPCGatewayAttachment: {
          Type: 'AWS::EC2::VPCGatewayAttachment',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
            InternetGatewayId: {
              Ref: 'InternetGateway',
            },
          },
        },
      });
    });
  });
});
