'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileRoutes()', () => {
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

  it('should create Route resources', () => {
    return awsCompileVpc.compileRoutes().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Object.keys(Resources)).to.have.lengthOf(6);
      expect(Resources.RouteSubnetPublicfooNatGateway).to.deep.equal({
        Type: 'AWS::EC2::Route',
        Properties: {
          DestinationCidrBlock: '0.0.0.0/0',
          RouteTableId: {
            Ref: 'RouteTablePrivate',
          },
          NatGatewayId: {
            Ref: 'SubnetPublicfooNatGateway',
          },
        },
        DependsOn: 'VPCGatewayAttachment',
      });
      expect(Resources.RouteSubnetPublicbazNatGateway).to.deep.equal({
        Type: 'AWS::EC2::Route',
        Properties: {
          DestinationCidrBlock: '0.0.0.0/0',
          RouteTableId: {
            Ref: 'RouteTablePrivate',
          },
          NatGatewayId: {
            Ref: 'SubnetPublicbazNatGateway',
          },
        },
        DependsOn: 'VPCGatewayAttachment',
      });
      expect(Resources.RouteInternetGateway).to.deep.equal({
        Type: 'AWS::EC2::Route',
        Properties: {
          DestinationCidrBlock: '0.0.0.0/0',
          RouteTableId: {
            Ref: 'RouteTablePublic',
          },
          GatewayId: {
            Ref: 'InternetGateway',
          },
        },
        DependsOn: 'VPCGatewayAttachment',
      });
    });
  });
});
