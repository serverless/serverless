'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileNatGateways()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        SubnetPublicfoo: {},
        SubnetPrivatebar: {},
        SubnetPublicbaz: {},
      },
      Outputs: {},
    };

    awsCompileVpc = new AwsCompileVpc(serverless);
  });

  it('should create NatGateway resources for public subnets', () => {
    return awsCompileVpc.compileNatGateways().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Object.keys(Resources)).to.have.lengthOf(5);
      expect(Resources.SubnetPublicfooNatGateway).to.deep.equal({
        Type: 'AWS::EC2::NatGateway',
        DependsOn: 'NatPublicIp',
        Properties: {
          AllocationId: {
            'Fn::GetAtt': ['NatPublicIp', 'AllocationId'],
          },
          SubnetId: {
            Ref: 'SubnetPublicfoo',
          },
        },
      });
      expect(Resources.SubnetPublicbazNatGateway).to.deep.equal({
        Type: 'AWS::EC2::NatGateway',
        DependsOn: 'NatPublicIp',
        Properties: {
          AllocationId: {
            'Fn::GetAtt': ['NatPublicIp', 'AllocationId'],
          },
          SubnetId: {
            Ref: 'SubnetPublicbaz',
          },
        },
      });
    });
  });
});
