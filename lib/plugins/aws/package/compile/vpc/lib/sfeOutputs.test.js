'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#compileSfeOutputs()', () => {
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

  it('should create SFE outputs', () => {
    return awsCompileVpc.compileSfeOutputs().then(() => {
      const { outputs } = awsCompileVpc.serverless.service;

      expect(outputs).to.deep.equal({
        VPC: {
          Ref: 'VPC',
        },
        SubnetPublicfoo: {
          Ref: 'SubnetPublicfoo',
        },
        SubnetPublicbaz: {
          Ref: 'SubnetPublicbaz',
        },
        SubnetPrivatebar: {
          Ref: 'SubnetPrivatebar',
        },
        SubnetPrivatequx: {
          Ref: 'SubnetPrivatequx',
        },
        LambdaSecurityGroup: {
          Ref: 'LambdaSecurityGroup',
        },
      });
    });
  });
});
