'use strict';

const expect = require('chai').expect;
const AwsCompileVpc = require('../index');
const Serverless = require('../../../../../../Serverless');
const AwsProvider = require('../../../../provider/awsProvider');

describe('#updateFunctionConfigs()', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.functions = {
      first: {},
      second: {
        vpc: {
          subnetIds: ['existingSubnet1', 'existingSubnet2'],
          securityGroupIds: ['existingSecurityGroup1', 'existingSecurityGroup2'],
        },
      },
    };
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

  it('should update function configs with no existing vpc configs', () => {
    return awsCompileVpc.updateFunctionConfigs().then(() => {
      const { functions } = awsCompileVpc.serverless.service;

      expect(functions.first).to.deep.equal({
        vpc: {
          securityGroupIds: [
            {
              'Fn::GetAtt': ['LambdaSecurityGroup', 'GroupId'],
            },
          ],
          subnetIds: [
            {
              Ref: 'SubnetPrivatebar',
            },
            {
              Ref: 'SubnetPrivatequx',
            },
          ],
        },
      });
    });
  });

  it('should update function configs with existing vpc configs', () => {
    return awsCompileVpc.updateFunctionConfigs().then(() => {
      const { functions } = awsCompileVpc.serverless.service;

      expect(functions.second).to.deep.equal({
        vpc: {
          subnetIds: [
            'existingSubnet1',
            'existingSubnet2',
            {
              Ref: 'SubnetPrivatebar',
            },
            {
              Ref: 'SubnetPrivatequx',
            },
          ],
          securityGroupIds: [
            'existingSecurityGroup1',
            'existingSecurityGroup2',
            {
              'Fn::GetAtt': ['LambdaSecurityGroup', 'GroupId'],
            },
          ],
        },
      });
    });
  });
});
