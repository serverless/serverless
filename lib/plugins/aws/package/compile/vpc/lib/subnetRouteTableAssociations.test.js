'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compuleSubnetRouteTableAssociations()', () => {
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

  it('should create SubnetRouteTableAssociation resources', () => {
    return awsCompileVpc.compileSubnetRouteTableAssociations().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Object.keys(Resources)).to.have.lengthOf(8);
      expect(Resources.SubnetPublicfooRouteTableAssociation).to.deep.equal({
        Type: 'AWS::EC2::SubnetRouteTableAssociation',
        Properties: {
          SubnetId: {
            Ref: 'SubnetPublicfoo',
          },
          RouteTableId: {
            Ref: 'RouteTablePublic',
          },
        },
      });
      expect(Resources.SubnetPublicbazRouteTableAssociation).to.deep.equal({
        Type: 'AWS::EC2::SubnetRouteTableAssociation',
        Properties: {
          SubnetId: {
            Ref: 'SubnetPublicbaz',
          },
          RouteTableId: {
            Ref: 'RouteTablePublic',
          },
        },
      });
      expect(Resources.SubnetPrivatebarRouteTableAssociation).to.deep.equal({
        Type: 'AWS::EC2::SubnetRouteTableAssociation',
        Properties: {
          SubnetId: {
            Ref: 'SubnetPrivatebar',
          },
          RouteTableId: {
            Ref: 'RouteTablePrivate',
          },
        },
      });
      expect(Resources.SubnetPrivatequxRouteTableAssociation).to.deep.equal({
        Type: 'AWS::EC2::SubnetRouteTableAssociation',
        Properties: {
          SubnetId: {
            Ref: 'SubnetPrivatequx',
          },
          RouteTableId: {
            Ref: 'RouteTablePrivate',
          },
        },
      });
    });
  });
});
