'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire').noCallThru();
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../../../../lib/serverless');
const runServerless = require('../../../../../../../utils/run-serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

const serverlessConfigurationExtension = {
  functions: {
    singleCustomSenderSourceKmsStringARN: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceKmsStringARN',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
      ],
    },
    singleCustomSenderSourceKmsRefARN: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceKmsRefARN',
            trigger: 'CustomSMSSender',
            kmsKeyId: {
              'Fn::GetAtt': ['kmsKey', 'Arn'],
            },
          },
        },
      ],
    },
    multipleCustomSenderSourceForSinglePool: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'MultipleCustomSenderSourceForSinglePool',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
        {
          cognitoUserPool: {
            pool: 'MultipleCustomSenderSourceForSinglePool',
            trigger: 'CustomEmailSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
      ],
    },
    singleCustomSenderSourceForMultiplePools1: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceForMultiplePools1',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
      ],
    },
    singleCustomSenderSourceForMultiplePools2: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceForMultiplePools2',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
          },
        },
      ],
    },
    singleCustomSenderSourceKmsStringARNExisting: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceKmsStringARNExisting',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
            existing: true,
          },
        },
      ],
    },
    singleCustomSenderSourceKmsRefARNExisting: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceKmsRefARNExisting',
            trigger: 'CustomSMSSender',
            kmsKeyId: {
              'Fn::GetAtt': ['kmsKey', 'Arn'],
            },
            existing: true,
          },
        },
      ],
    },
    multipleCustomSenderSourceForSinglePoolExisting: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'MultipleCustomSenderSourceForSinglePoolExisting',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
            existing: true,
          },
        },
        {
          cognitoUserPool: {
            pool: 'MultipleCustomSenderSourceForSinglePoolExisting',
            trigger: 'CustomEmailSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
            existing: true,
          },
        },
      ],
    },
    singleCustomSenderSourceForMultiplePoolsExisting1: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceForMultiplePoolsExisting1',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
            existing: true,
          },
        },
      ],
    },
    singleCustomSenderSourceForMultiplePoolsExisting2: {
      handler: 'index.js',
      events: [
        {
          cognitoUserPool: {
            pool: 'SingleCustomSenderSourceForMultiplePoolsExisting2',
            trigger: 'CustomSMSSender',
            kmsKeyId: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
            existing: true,
          },
        },
      ],
    },
  },
};

describe('AwsCompileCognitoUserPoolEvents', () => {
  let serverless;
  let awsCompileCognitoUserPoolEvents;
  let addCustomResourceToServiceStub;

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    const AwsCompileCognitoUserPoolEvents = proxyquire(
      '../../../../../../../../lib/plugins/aws/package/compile/events/cognito-user-pool',
      {
        '../../../custom-resources': {
          addCustomResourceToService: addCustomResourceToServiceStub,
        },
      }
    );
    serverless = new Serverless({ commands: [], options: {} });
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileCognitoUserPoolEvents = new AwsCompileCognitoUserPoolEvents(serverless);
    awsCompileCognitoUserPoolEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCognitoUserPoolEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#newCognitoUserPools()', () => {
    it('should create resources when CUP events are given as separate functions', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool2',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.SecondLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePostConfirmation
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when CUP events are given with the same function', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'PreSignUp',
              },
            },
            {
              cognitoUserPool: {
                pool: 'MyUserPool2',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePostConfirmation
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when CUP events are given with diff funcs and single event', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool2',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(
        serverless.service.serverless.getProvider('aws').naming.getLambdaLogicalId('first')
      );

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(
        serverless.service.serverless.getProvider('aws').naming.getLambdaLogicalId('second')
      );

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.SecondLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create single user pool resource when the same pool referenced repeatedly', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PostConfirmation',
              },
            },
          ],
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties.LambdaConfig
        )
      ).to.have.lengthOf(2);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(2);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.SecondLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePostConfirmation
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should not create resources when CUP events are not given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });

  describe('#existingCognitoUserPools()', () => {
    it('should create the necessary resources for the most minimal configuration', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomMessage',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools()
      ).to.be.fulfilled.then(() => {
        const { Resources } =
          awsCompileCognitoUserPoolEvents.serverless.service.provider
            .compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('cognitoUserPool');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: [
              'cognito-idp:ListUserPools',
              'cognito-idp:DescribeUserPool',
              'cognito-idp:UpdateUserPool',
            ],
            Effect: 'Allow',
            Resource: '*',
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: { 'Fn::Sub': 'arn:${AWS::Partition}:lambda:*:*:function:first' },
          },
          {
            Effect: 'Allow',
            Resource: {
              'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/*',
            },
            Action: ['iam:PassRole'],
          },
        ]);
        expect(Resources.FirstCustomCognitoUserPool1).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashcupLambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: 'first',
            UserPoolName: 'existing-cognito-user-pool',
            UserPoolConfigs: [
              {
                Trigger: 'CustomMessage',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });
    });

    it('should support `forceDeploy` setting', async () => {
      const result = await runServerless({
        fixture: 'cognito-user-pool',
        configExt: {
          functions: {
            existingSimple: {
              events: [
                {
                  cognitoUserPool: {
                    forceDeploy: true,
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });

      const { Resources } = result.cfTemplate;
      const { awsNaming } = result;

      const customResource =
        Resources[awsNaming.getCustomResourceCognitoUserPoolResourceLogicalId('existingSimple')];

      expect(typeof customResource.Properties.ForceDeploy).to.equal('number');
    });

    it('should create the necessary resources for a service using multiple event definitions', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomMessage',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'DefineAuthChallenge',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools()
      ).to.be.fulfilled.then(() => {
        const { Resources } =
          awsCompileCognitoUserPoolEvents.serverless.service.provider
            .compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('cognitoUserPool');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: [
              'cognito-idp:ListUserPools',
              'cognito-idp:DescribeUserPool',
              'cognito-idp:UpdateUserPool',
            ],
            Effect: 'Allow',
            Resource: '*',
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: { 'Fn::Sub': 'arn:${AWS::Partition}:lambda:*:*:function:first' },
          },
          {
            Effect: 'Allow',
            Resource: {
              'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/*',
            },
            Action: ['iam:PassRole'],
          },
        ]);
        expect(Resources.FirstCustomCognitoUserPool1).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashcupLambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: 'first',
            UserPoolName: 'existing-cognito-user-pool',
            UserPoolConfigs: [
              {
                Trigger: 'CustomMessage',
              },
              {
                Trigger: 'PreSignUp',
              },
              {
                Trigger: 'DefineAuthChallenge',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });
    });

    it('should create DependsOn clauses when one cognito user pool is used in more than 1 custom resources', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomMessage',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'DefineAuthChallenge',
                existing: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'PostConfirmation',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'PreAuthentication',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'PostAuthentication',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(
        awsCompileCognitoUserPoolEvents.existingCognitoUserPools()
      ).to.be.fulfilled.then(() => {
        const { Resources } =
          awsCompileCognitoUserPoolEvents.serverless.service.provider
            .compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('cognitoUserPool');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: [
              'cognito-idp:ListUserPools',
              'cognito-idp:DescribeUserPool',
              'cognito-idp:UpdateUserPool',
            ],
            Effect: 'Allow',
            Resource: '*',
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: { 'Fn::Sub': 'arn:${AWS::Partition}:lambda:*:*:function:first' },
          },
          {
            Action: [
              'cognito-idp:ListUserPools',
              'cognito-idp:DescribeUserPool',
              'cognito-idp:UpdateUserPool',
            ],
            Effect: 'Allow',
            Resource: '*',
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: { 'Fn::Sub': 'arn:${AWS::Partition}:lambda:*:*:function:second' },
          },
          {
            Effect: 'Allow',
            Resource: {
              'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/*',
            },
            Action: ['iam:PassRole'],
          },
        ]);
        expect(Object.keys(Resources)).to.have.length(2);
        expect(Resources.FirstCustomCognitoUserPool1).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashcupLambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: 'first',
            UserPoolName: 'existing-cognito-user-pool',
            UserPoolConfigs: [
              {
                Trigger: 'CustomMessage',
              },
              {
                Trigger: 'PreSignUp',
              },
              {
                Trigger: 'DefineAuthChallenge',
              },
            ],
            ForceDeploy: undefined,
          },
        });
        expect(Resources.SecondCustomCognitoUserPool1).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'SecondLambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
            'FirstCustomCognitoUserPool1',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: 'second',
            UserPoolName: 'existing-cognito-user-pool',
            UserPoolConfigs: [
              {
                Trigger: 'PostConfirmation',
              },
              {
                Trigger: 'PreAuthentication',
              },
              {
                Trigger: 'PostAuthentication',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });
    });

    it('should throw if more than 1 Cognito User Pool is configured per function', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomMessage',
                existing: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool-2',
                trigger: 'PreSignUp',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.existingCognitoUserPools()).to.throw(
        'Only one Cognito User Pool'
      );
    });
  });

  describe('#mergeWithCustomResources()', () => {
    it('does not merge if no custom resource is found in Resources', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      };
      awsCompileCognitoUserPoolEvents.serverless.service.resources = {};

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(2);
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties.LambdaConfig
        )
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should merge custom resources found in Resources', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      };
      awsCompileCognitoUserPoolEvents.serverless.service.resources = {
        CognitoUserPoolMyUserPool: {
          Type: 'AWS::Cognito::UserPool',
          Properties: {
            UserPoolName: 'ProdMyUserPool',
            MfaConfiguration: 'OFF',
            EmailVerificationSubject: 'Your verification code',
            EmailVerificationMessage: 'Your verification code is {####}.',
            SmsVerificationMessage: 'Your verification code is {####}.',
          },
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(6);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(1);
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties.LambdaConfig
        )
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should merge `DependsOn` clauses correctly if being overridden from Resources', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      };
      awsCompileCognitoUserPoolEvents.serverless.service.resources = {
        CognitoUserPoolMyUserPool: {
          DependsOn: ['Something', 'SomethingElse', ['Nothing', 'NothingAtAll']],
          Type: 'AWS::Cognito::UserPool',
          Properties: {
            UserPoolName: 'ProdMyUserPool',
            MfaConfiguration: 'OFF',
            EmailVerificationSubject: 'Your verification code',
            EmailVerificationMessage: 'Your verification code is {####}.',
            SmsVerificationMessage: 'Your verification code is {####}.',
          },
        },
      };

      awsCompileCognitoUserPoolEvents.newCognitoUserPools();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(4);
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(6);
      expect(
        Object.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties.LambdaConfig
        )
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
    });
  });
});

describe('lib/plugins/aws/package/compile/events/cognito-user-pool.test.js', () => {
  let cfResources;

  before(async () => {
    const { cfTemplate } = await runServerless({
      fixture: 'function',
      configExt: serverlessConfigurationExtension,
      command: 'package',
    });

    ({ Resources: cfResources } = cfTemplate);
  });

  describe('Custom Sender Sources', () => {
    describe('Schema Issues', () => {
      it('should throw if more than 1 KMS Key is configured per new Cognito User Pool', async () => {
        return await expect(
          runServerless({
            fixture: 'function',
            configExt: {
              functions: {
                basic: {
                  events: [
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomSMSSender',
                        kmsKeyId:
                          'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                      },
                    },
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomEmailSender',
                        kmsKeyId:
                          'arn:aws:kms:eu-west-1:111111111111:key/22222222-9abc-def0-1234-56789abcdef1',
                      },
                    },
                  ],
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejectedWith('Only one KMS Key');
      });

      it('should throw if more than 1 KMS Key is configured per existing Cognito User Pool', async () => {
        return await expect(
          runServerless({
            fixture: 'function',
            configExt: {
              functions: {
                basic: {
                  events: [
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomSMSSender',
                        kmsKeyId:
                          'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                        existing: true,
                      },
                    },
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomEmailSender',
                        kmsKeyId:
                          'arn:aws:kms:eu-west-1:111111111111:key/22222222-9abc-def0-1234-56789abcdef1',
                        existing: true,
                      },
                    },
                  ],
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejectedWith('Only one KMS Key');
      });

      it('should throw if no KMS Key is configured for a new Cognito User Pool', () => {
        return expect(
          runServerless({
            fixture: 'function',
            configExt: {
              functions: {
                first: {
                  handler: 'index.js',
                  events: [
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomSMSSender',
                      },
                    },
                  ],
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejectedWith('KMS Key must be set');
      });

      it('should throw if no KMS Key is configured for an existing Cognito User Pool', () => {
        return expect(
          runServerless({
            fixture: 'function',
            configExt: {
              functions: {
                first: {
                  handler: 'index.js',
                  events: [
                    {
                      cognitoUserPool: {
                        pool: 'MyUserPool1',
                        trigger: 'CustomSMSSender',
                        existing: true,
                      },
                    },
                  ],
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejectedWith('KMS Key must be set');
      });
    });

    describe('New Pools', () => {
      it('should create resources when a KMS Key is configured as a string', () => {
        expect(cfResources.CognitoUserPoolSingleCustomSenderSourceKmsStringARN.Type).to.equal(
          'AWS::Cognito::UserPool'
        );
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsStringARN.DependsOn
        ).to.have.lengthOf(1);
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsStringARN.Properties.LambdaConfig
            .KMSKeyID
        ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsStringARN.Properties.LambdaConfig
            .CustomSMSSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['SingleCustomSenderSourceKmsStringARNLambdaFunction', 'Arn'],
        });
        expect(
          cfResources
            .SingleCustomSenderSourceKmsStringARNLambdaPermissionCognitoUserPoolSingleCustomSenderSourceKmsStringARNTriggerSourceCustomSMSSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
      });

      it('should create resources when a KMS Key is configured as ARN Reference', () => {
        expect(cfResources.CognitoUserPoolSingleCustomSenderSourceKmsRefARN.Type).to.equal(
          'AWS::Cognito::UserPool'
        );
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsRefARN.DependsOn
        ).to.have.lengthOf(1);
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsRefARN.Properties.LambdaConfig
            .KMSKeyID
        ).to.deep.equal({
          'Fn::GetAtt': ['kmsKey', 'Arn'],
        });
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceKmsRefARN.Properties.LambdaConfig
            .CustomSMSSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['SingleCustomSenderSourceKmsRefARNLambdaFunction', 'Arn'],
        });
        expect(
          cfResources
            .SingleCustomSenderSourceKmsRefARNLambdaPermissionCognitoUserPoolSingleCustomSenderSourceKmsRefARNTriggerSourceCustomSMSSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
      });

      it('should create resources when CUP events that specify multiple custom sender sources are given', () => {
        expect(cfResources.CognitoUserPoolMultipleCustomSenderSourceForSinglePool.Type).to.equal(
          'AWS::Cognito::UserPool'
        );
        expect(
          cfResources.CognitoUserPoolMultipleCustomSenderSourceForSinglePool.DependsOn
        ).to.have.lengthOf(2);
        expect(
          cfResources.CognitoUserPoolMultipleCustomSenderSourceForSinglePool.Properties.LambdaConfig
            .KMSKeyID
        ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
        expect(
          cfResources.CognitoUserPoolMultipleCustomSenderSourceForSinglePool.Properties.LambdaConfig
            .CustomSMSSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['MultipleCustomSenderSourceForSinglePoolLambdaFunction', 'Arn'],
        });
        expect(
          cfResources.CognitoUserPoolMultipleCustomSenderSourceForSinglePool.Properties.LambdaConfig
            .CustomEmailSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['MultipleCustomSenderSourceForSinglePoolLambdaFunction', 'Arn'],
        });
        expect(
          cfResources
            .MultipleCustomSenderSourceForSinglePoolLambdaPermissionCognitoUserPoolMultipleCustomSenderSourceForSinglePoolTriggerSourceCustomSMSSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
        expect(
          cfResources
            .MultipleCustomSenderSourceForSinglePoolLambdaPermissionCognitoUserPoolMultipleCustomSenderSourceForSinglePoolTriggerSourceCustomEmailSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
      });

      it('should create resources when a single KMS Key is configured per new Cognito User Pool', () => {
        expect(cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools1.Type).to.equal(
          'AWS::Cognito::UserPool'
        );
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools1.DependsOn
        ).to.have.lengthOf(1);
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools1.Properties
            .LambdaConfig.KMSKeyID
        ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools1.Properties
            .LambdaConfig.CustomSMSSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['SingleCustomSenderSourceForMultiplePools1LambdaFunction', 'Arn'],
        });
        expect(
          cfResources
            .SingleCustomSenderSourceForMultiplePools1LambdaPermissionCognitoUserPoolSingleCustomSenderSourceForMultiplePools1TriggerSourceCustomSMSSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
        expect(cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools2.Type).to.equal(
          'AWS::Cognito::UserPool'
        );
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools2.Properties
            .LambdaConfig.KMSKeyID
        ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools2.DependsOn
        ).to.have.lengthOf(1);
        expect(
          cfResources.CognitoUserPoolSingleCustomSenderSourceForMultiplePools2.Properties
            .LambdaConfig.CustomSMSSender.LambdaArn
        ).to.deep.equal({
          'Fn::GetAtt': ['SingleCustomSenderSourceForMultiplePools2LambdaFunction', 'Arn'],
        });
        expect(
          cfResources
            .SingleCustomSenderSourceForMultiplePools2LambdaPermissionCognitoUserPoolSingleCustomSenderSourceForMultiplePools2TriggerSourceCustomSMSSender
            .Type
        ).to.equal('AWS::Lambda::Permission');
      });
    });

    describe('Existing Pools', () => {
      it('should create resources when a KMS Key is configured as a string', () => {
        const functionName =
          cfResources.SingleCustomSenderSourceKmsStringARNExistingLambdaFunction.Properties
            .FunctionName;
        expect(
          cfResources.SingleCustomSenderSourceKmsStringARNExistingCustomCognitoUserPool1
        ).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'SingleCustomSenderSourceKmsStringARNExistingLambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: functionName,
            UserPoolName: 'SingleCustomSenderSourceKmsStringARNExisting',
            UserPoolConfigs: [
              {
                Trigger: 'CustomSMSSender',
                KMSKeyID:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                LambdaVersion: 'V1_0',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });

      it('should create resources when a KMS Key is configured as ARN Reference', () => {
        const functionName =
          cfResources.SingleCustomSenderSourceKmsRefARNExistingLambdaFunction.Properties
            .FunctionName;
        expect(
          cfResources.SingleCustomSenderSourceKmsRefARNExistingCustomCognitoUserPool1
        ).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'SingleCustomSenderSourceKmsRefARNExistingLambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: functionName,
            UserPoolName: 'SingleCustomSenderSourceKmsRefARNExisting',
            UserPoolConfigs: [
              {
                Trigger: 'CustomSMSSender',
                KMSKeyID: {
                  'Fn::GetAtt': ['kmsKey', 'Arn'],
                },
                LambdaVersion: 'V1_0',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });

      it('should create resources when CUP events that specify multiple custom sender sources are given', () => {
        const functionName =
          cfResources.MultipleCustomSenderSourceForSinglePoolExistingLambdaFunction.Properties
            .FunctionName;
        expect(
          cfResources.MultipleCustomSenderSourceForSinglePoolExistingCustomCognitoUserPool1
        ).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'MultipleCustomSenderSourceForSinglePoolExistingLambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: functionName,
            UserPoolName: 'MultipleCustomSenderSourceForSinglePoolExisting',
            UserPoolConfigs: [
              {
                Trigger: 'CustomSMSSender',
                KMSKeyID:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                LambdaVersion: 'V1_0',
              },
              {
                Trigger: 'CustomEmailSender',
                KMSKeyID:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                LambdaVersion: 'V1_0',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });

      it('should create resources when a single KMS Key is configured per new Cognito User Pool', () => {
        const functionName1 =
          cfResources.SingleCustomSenderSourceForMultiplePoolsExisting1LambdaFunction.Properties
            .FunctionName;
        expect(
          cfResources.SingleCustomSenderSourceForMultiplePoolsExisting1CustomCognitoUserPool1
        ).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'SingleCustomSenderSourceForMultiplePoolsExisting1LambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: functionName1,
            UserPoolName: 'SingleCustomSenderSourceForMultiplePoolsExisting1',
            UserPoolConfigs: [
              {
                Trigger: 'CustomSMSSender',
                KMSKeyID:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                LambdaVersion: 'V1_0',
              },
            ],
            ForceDeploy: undefined,
          },
        });

        const functionName2 =
          cfResources.SingleCustomSenderSourceForMultiplePoolsExisting2LambdaFunction.Properties
            .FunctionName;
        expect(
          cfResources.SingleCustomSenderSourceForMultiplePoolsExisting2CustomCognitoUserPool1
        ).to.deep.equal({
          Type: 'Custom::CognitoUserPool',
          Version: 1,
          DependsOn: [
            'SingleCustomSenderSourceForMultiplePoolsExisting2LambdaFunction',
            'CustomDashresourceDashexistingDashcupLambdaFunction',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashcupLambdaFunction', 'Arn'],
            },
            FunctionName: functionName2,
            UserPoolName: 'SingleCustomSenderSourceForMultiplePoolsExisting2',
            UserPoolConfigs: [
              {
                Trigger: 'CustomSMSSender',
                KMSKeyID:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                LambdaVersion: 'V1_0',
              },
            ],
            ForceDeploy: undefined,
          },
        });
      });
    });
  });
});
