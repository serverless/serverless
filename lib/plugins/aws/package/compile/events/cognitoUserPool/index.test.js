'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('lodash');
const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire').noCallThru();
const AwsProvider = require('../../../../provider/awsProvider');
const Serverless = require('../../../../../../Serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('AwsCompileCognitoUserPoolEvents', () => {
  let serverless;
  let awsCompileCognitoUserPoolEvents;
  let addCustomResourceToServiceStub;

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    const AwsCompileCognitoUserPoolEvents = proxyquire('./index', {
      '../../../../customResources': {
        addCustomResourceToService: addCustomResourceToServiceStub,
      },
    });
    serverless = new Serverless();
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
    it('should throw an error if cognitoUserPool event type is not an object', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: 42,
            },
          ],
        },
      };

      expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(Error);
    });

    it('should throw an error if the "pool" property is not given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(Error);
    });

    it('should throw an error if the "trigger" property is not given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                trigger: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(Error);
    });

    it('should throw an error if the "trigger" property is invalid', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'invalidTrigger',
              },
            },
          ],
        },
      };

      expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(Error);
    });

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
        _.keys(
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
        const {
          Resources,
        } = awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate;

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
            Resource: 'arn:aws:lambda:*:*:function:first',
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
          },
        });
      });
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
        const {
          Resources,
        } = awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate;

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
            Resource: 'arn:aws:lambda:*:*:function:first',
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
        const {
          Resources,
        } = awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate;

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
            Resource: 'arn:aws:lambda:*:*:function:first',
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
            Resource: 'arn:aws:lambda:*:*:function:second',
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
        _.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(2);
      expect(
        _.keys(
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
        _.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(6);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(1);
      expect(
        _.keys(
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
        _.keys(
          awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.CognitoUserPoolMyUserPool.Properties
        )
      ).to.have.lengthOf(6);
      expect(
        _.keys(
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
