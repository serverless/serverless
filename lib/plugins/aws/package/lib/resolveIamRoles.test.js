'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../test/utils/run-serverless');

describe('#resolveIamRoles()', () => {
  let awsNaming;
  let cfTemplate;

  const testIamRoleStatements = [
    { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: 'arn:aws:s3:::someBucket' },

    {
      Effect: 'Deny',
      Action: ['s3:ListBucket'],
      Resource: { 'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'SomeBucket' }, '/*']] },
    },
  ];

  const testManagedPolicies = ['arn:xxx:*:*', 'arn:yyy:*:*'];

  before(async () => {
    const { cfTemplate: cfTemp, awsNaming: naming } = await runServerless({
      fixture: 'function',
      configExt: {
        provider: {
          iamRoleStatements: testIamRoleStatements,
          iamManagedPolicies: testManagedPolicies,
          vpc: { securityGroupIds: ['securityGroupId1', 'securityGroupId2'] },
        },
      },
      cliArgs: ['package'],
    });
    cfTemplate = cfTemp;
    awsNaming = naming;
  });

  it('should add all provider managed policies to CF Template', () => {
    testManagedPolicies.forEach(policy => {
      expect(
        cfTemplate.Resources[awsNaming.getRoleLogicalId()].properties.managedPolicyArns
      ).to.deep.include(policy);
    });
  });

  it('should add all functions managed policies to CF Template', () => {});
});
