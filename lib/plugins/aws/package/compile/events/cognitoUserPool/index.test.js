'use strict';

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

    it('should create corresponding resources when Cognito User Pool events are given ' +
      'as separate functions', () => {
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
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool1PreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool2PostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create corresponding resources when Cognito User Pool events are given ' +
      'with the same function', () => {
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
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool1PreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool2PostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create corresponding resources when Cognito User Pool events are given ' +
      'with different functions and single event', () => {
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
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool1
        .Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(serverless.service.serverless.getProvider('aws')
        .naming.getLambdaLogicalId('first'));

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool2
        .Properties.LambdaConfig.PreSignUp['Fn::GetAtt'][0]
      ).to.equal(serverless.service.serverless.getProvider('aws')
        .naming.getLambdaLogicalId('second'));

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool1PreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolTriggerSourceMyUserPool2PreSignUp.Type
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
      expect(Object.keys(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .CognitoUserPoolMyUserPool.Properties.LambdaConfig).length
      ).to.equal(2);
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .SecondLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should merge corresponding resources when Cognito User Pool is predefined ' +
      'in Resources', () => {
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          MyUserPool: {
            Type: 'AWS::Cognito::UserPool',
            Properties: {
              UserPoolName: 'my-user-pool',
            },
          },
        },
      };
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
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
        .compiledCloudFormationTemplate.Resources.MyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.MyUserPool.Properties.UserPoolName
      ).to.equal('my-user-pool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should merge corresponding resources when generated Cognito User Pool is overridden ' +
      'in Resources', () => {
      serverless.service.provider.compiledCloudFormationTemplate = {
        Resources: {
          CognitoUserPoolMyUserPool: {
            Type: 'AWS::Cognito::UserPool',
            Properties: {
              UserPoolName: 'my-user-pool',
            },
          },
        },
      };
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
              },
            },
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
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool.Type
      ).to.equal('AWS::Cognito::UserPool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.CognitoUserPoolMyUserPool.Properties.UserPoolName
      ).to.equal('my-user-pool');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPreSignUp.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionCognitoUserPoolTriggerSourceMyUserPoolPostConfirmation.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should not create corresponding resources when Cognito User Pool events' +
      ' are not given', () => {
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
});
