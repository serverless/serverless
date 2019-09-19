'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileRouteTables()', () => {
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

  it('should create public and private RouteTable resources', () => {
    return awsCompileVpc.compileRouteTables().then(() => {
      const {
        Resources,
      } = awsCompileVpc.serverless.service.provider.compiledCloudFormationTemplate;

      expect(Resources).to.deep.equal({
        RouteTablePrivate: {
          Type: 'AWS::EC2::RouteTable',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
          },
        },
        RouteTablePublic: {
          Type: 'AWS::EC2::RouteTable',
          Properties: {
            VpcId: {
              Ref: 'VPC',
            },
          },
        },
      });
    });
  });
});
