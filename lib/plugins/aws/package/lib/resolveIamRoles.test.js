'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../test/utils/run-serverless');

describe('#resolveIamRoles()', () => {
  let serverless;
  let cfTemplate;
  let roleLogicalId;

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
    const { serverless: sls, cfTemplate: cfTemp, awsNaming: naming } = await runServerless({
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
    roleLogicalId = naming.getRoleLogicalId();
    serverless = sls;
  });

  it('should add all principals from provider.iamConfig to to CF Template', () => {
    const templatePrincipals =
      cfTemplate.Resources[roleLogicalId].Properties.AssumeRolePolicyDocument.Statement[0].Principal
        .Service;

    serverless.service.provider.iamConfig.principals.forEach(principal => {
      expect(templatePrincipals).to.include(principal);
    });
  });

  it('should add all principals from functions[].iamConfig to CF Template', () => {
    const templatePrincipals =
      cfTemplate.Resources[roleLogicalId].Properties.AssumeRolePolicyDocument.Statement[0].Principal
        .Service;

    serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = serverless.service.getFunction(functionName);
      functionObject.iamConfig.principals.forEach(principal => {
        expect(templatePrincipals).to.include(principal);
      });
    });
  });

  it('should add all provider managed policies from provider.iamConfig to CF Template', () => {
    const templateManagedPolicies =
      cfTemplate.Resources[roleLogicalId].Properties.ManagedPolicyArns;

    serverless.service.provider.iamConfig.managedPolicies.forEach(policy => {
      expect(templateManagedPolicies).to.deep.include(policy);
    });
  });

  it('should add all functions managed policies from functionsi[].iamConfig to CF Template', () => {
    const templateManagedPolicies =
      cfTemplate.Resources[roleLogicalId].Properties.ManagedPolicyArns;

    serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = serverless.service.getFunction(functionName);
      functionObject.iamConfig.managedPolicies.forEach(policy => {
        expect(templateManagedPolicies).to.deep.include(policy);
      });
    });
  });

  it('should add all policy statements from provider.iamConfig to CF Template', () => {
    const templatePolicyStatements =
      cfTemplate.Resources[roleLogicalId].Properties.Policies[0].PolicyDocument.Statement;

    serverless.service.provider.iamConfig.policyStatements.forEach(statement => {
      expect(templatePolicyStatements).to.deep.include(statement);
    });
  });

  it('should add all policy statements from functions[].iamConfig to CF Template', () => {
    const templatePolicyStatements =
      cfTemplate.Resources[roleLogicalId].Properties.Policies[0].PolicyDocument.Statement;

    serverless.service.getAllFunctions().forEach(functionName => {
      const functionObject = serverless.service.getFunction(functionName);

      functionObject.iamConfig.policyStatements.forEach(statement => {
        expect(templatePolicyStatements).to.deep.include(statement);
      });
    });
  });
});
