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
    it('should throw when invalid CUP event is given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'INVALID_EVENT',
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(
        'Invalid trigger source'
      );
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

    it('should create resources when a single CUP event that specifies a custom sender source is given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomSMSSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
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
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.KMSKeyID
      ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomSMSSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when CUP events that specify multiple custom sender sources are given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
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
      ).to.have.lengthOf(2);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.KMSKeyID
      ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomEmailSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomEmailSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomSMSSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomEmailSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when a single KMS Key is configured per new Cognito User Pool', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
                pool: 'MyUserPool2',
                trigger: 'CustomEmailSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/22222222-9abc-def0-1234-56789abcdef1',
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
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.KMSKeyID
      ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomSMSSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Properties.LambdaConfig.KMSKeyID
      ).to.equal('arn:aws:kms:eu-west-1:111111111111:key/22222222-9abc-def0-1234-56789abcdef1');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Properties.LambdaConfig.CustomEmailSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool2.Properties.LambdaConfig.CustomEmailSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourceCustomEmailSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when a KMS Key is configured as ARN Reference', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomSMSSender',
                kmsKeyId: {
                  'Fn::GetAtt': ['kmsKey', 'Arn'],
                },
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
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.KMSKeyID
      ).to.deep.equal({
        'Fn::GetAtt': ['kmsKey', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomSMSSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create resources when CUP events that specify multiple custom sender sources are given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomSMSSender',
                kmsKeyId: {
                  'Fn::GetAtt': ['kmsKey', 'Arn'],
                },
              },
            },
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomEmailSender',
                kmsKeyId: {
                  'Fn::GetAtt': ['kmsKey', 'Arn'],
                },
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
      ).to.have.lengthOf(2);
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.KMSKeyID
      ).to.deep.equal({
        'Fn::GetAtt': ['kmsKey', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomSMSSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomEmailSender.LambdaArn
      ).to.deep.equal({
        'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
      });
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CognitoUserPoolMyUserPool1.Properties.LambdaConfig.CustomEmailSender
          .LambdaVersion
      ).to.equal('V1_0');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomSMSSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourceCustomEmailSender
          .Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should throw if custom sender source does not contain required attributes', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomSMSSender',
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(
        'A KMS Key must be specified'
      );
    });

    it('should throw if more than 1 KMS Key is configured per new Cognito User Pool', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
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
      };

      return expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(
        'Only one KMS Key'
      );
    });

    it('should throw if invalid lambda version is specified for a custom sender source', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool1',
                trigger: 'CustomSMSSender',
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
                lambdaVersion: 'V2_0',
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.newCognitoUserPools()).to.throw(
        'Invalid Lambda version'
      );
    });
  });

  describe('#existingCognitoUserPools()', () => {
    it('should throw when invalid CUP event is given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'INVALID_EVENT',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.existingCognitoUserPools()).to.throw(
        'Invalid trigger source'
      );
    });

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
                    trigger: 'PreSignUp',
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

    it('should create resources for multiple custom sender sources', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomSMSSender',
                existing: true,
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomEmailSender',
                existing: true,
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
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
            Action: ['kms:CreateGrant'],
            Effect: 'Allow',
            Resource: 'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
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
                Trigger: 'CustomSMSSender',
                LambdaVersion: 'V1_0',
                KmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
              },
              {
                Trigger: 'CustomEmailSender',
                LambdaVersion: 'V1_0',
                KmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
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

    it('should throw if more than 1 KMS Set is configured per function', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomSMSSender',
                existing: true,
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/11111111-9abc-def0-1234-56789abcdef1',
              },
            },
            {
              cognitoUserPool: {
                pool: 'existing-cognito-user-pool',
                trigger: 'CustomEmailSender',
                existing: true,
                kmsKeyId:
                  'arn:aws:kms:eu-west-1:111111111111:key/22222222-9abc-def0-1234-56789abcdef1',
              },
            },
          ],
        },
      };

      return expect(() => awsCompileCognitoUserPoolEvents.existingCognitoUserPools()).to.throw(
        'Only one KMS Key'
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
