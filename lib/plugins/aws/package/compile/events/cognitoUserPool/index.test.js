'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCognitoUserPoolEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileCognitoUserPoolEvents', () => {
  let serverless;
  let awsCompileCognitoUserPoolEvents;

  beforeEach(() => {
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

  describe('#compileCognitoUserPoolEvents()', () => {
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

      expect(() => awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents()).to.throw(Error);
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

      expect(() => awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents()).to.throw(Error);
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

      expect(() => awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents()).to.throw(Error);
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

      expect(() => awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents()).to.throw(Error);
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePostConfirmation.Type
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePostConfirmation.Type
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1
        .Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(serverless.service.serverless.getProvider('aws')
        .naming.getLambdaLogicalId('first'));

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.DependsOn
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2
        .Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(serverless.service.serverless.getProvider('aws')
        .naming.getLambdaLogicalId('second'));

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPool1TriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolMyUserPool2TriggerSourcePreSignUp.Type
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties.LambdaConfig)
      ).to.have.lengthOf(2);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(2);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should not create resources when CUP events are not given', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(
        awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties)
      ).to.have.lengthOf(2);
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties.LambdaConfig)
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties)
      ).to.have.lengthOf(6);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(1);
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties.LambdaConfig)
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
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

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      awsCompileCognitoUserPoolEvents.mergeWithCustomResources();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.DependsOn
      ).to.have.lengthOf(4);
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties)
      ).to.have.lengthOf(6);
      expect(_.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties.LambdaConfig)
      ).to.have.lengthOf(1);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolMyUserPoolTriggerSourcePreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
    });
  });
});
