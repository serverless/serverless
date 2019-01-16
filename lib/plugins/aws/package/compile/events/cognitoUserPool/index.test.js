'use strict';

const _ = require('lodash');
const sinon = require('sinon');
const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCognitoUserPoolEvents = require('./index');
const Serverless = require('../../../../../../Serverless');
const CLI = require('../../../../../../../lib/classes/CLI');

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

    it('should NOT create user pool resource when pre-existing is true', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'ap-northeast-1_xyz012345',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
          ],
        },
        second: {
          events: [
            {
              cognitoUserPool: {
                pool: 'arn:aws:cognito-idp:us-east-1:000123456789:userpool/us-east-1_abcd45678',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
          ],
        },
      };

      awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();

      expect(awsCompileCognitoUserPoolEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });

  describe('pre-existing CUP', () => {
    it('should throw an error if cognitoUserPool preExisting field is not a boolean', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
                preExisting: 42,
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      }).to.throw(Error);
    });

    it('should pass if CUP is pre-existing but and its pool is ARN of pool or a pool id', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'ap-northeast-1_xyz012345',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
            {
              cognitoUserPool: {
                pool: 'arn:aws:cognito-idp:us-east-1:000123456789:userpool/us-east-1_abcd45678',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      }).not.to.throw(Error);
    });

    it('should throw an error if CUP is pre-existing but ' +
      'its pool is not a user pool idARN of pool nor a pool id', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'MyUserPool',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      }).to.throw(Error);
    });

    it('should throw an error if CUP is pre-existing but its pool is a invalid ARN', () => {
      awsCompileCognitoUserPoolEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cognitoUserPool: {
                pool: 'arn:aws:cognito-idp:us-east-1:0123456789:userpool/MyUserPool',
                trigger: 'PreSignUp',
                preExisting: true,
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      }).to.throw(Error);
    });


    it('should warn if CUP is not pre-existing but its pool is ARN or a pool id', () => {
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
                pool: 'ap-northeast-1_xyz012345',
                trigger: 'PreSignUp',
              },
            },
            {
              cognitoUserPool: {
                pool: 'arn:aws:cognito-idp:us-east-1:000123456789:userpool/us-east-1_abcd45678',
                trigger: 'PreSignUp',
              },
            },
          ],
        },
      };

      class CustomCLI extends CLI {}
      const consoleLogStub = sinon.stub(CustomCLI.prototype, 'log');
      serverless.cli = new CustomCLI(serverless);

      expect(() => {
        awsCompileCognitoUserPoolEvents.compileCognitoUserPoolEvents();
      }).not.to.throw(Error);
      expect(consoleLogStub.callCount).to.equal(2); // not 3, since MyUserPool is not ARN or id
    });

    describe('#beforeDeployPreExistingCognitoUserPools', () => {
      let requestStub;

      beforeEach(() => {
        requestStub = sinon.stub(awsCompileCognitoUserPoolEvents.provider, 'request');
      });
      afterEach(() => {
        requestStub.restore();
      });

      it('should reject if any one of the specified pre-existing CUPs do not exist', () => {
        awsCompileCognitoUserPoolEvents.serverless.service.functions = {
          first: {
            events: [
              {
                cognitoUserPool: {
                  pool: 'arn:aws:cognito-idp:us-east-1:000123456789:userpool/us-east-1_abcd45678',
                  trigger: 'PreSignUp',
                  preExisting: true,
                },
              },
              {
                cognitoUserPool: {
                  pool: 'us-west-2_wxyz12345',
                  trigger: 'PreSignUp',
                  preExisting: true,
                },
              },
            ],
          },
        };

        requestStub
          .onCall(0).resolves('success')
          .onCall(1).rejects(new Error('not exist'));

        return awsCompileCognitoUserPoolEvents.ensureAllPreExistingCognitoUserPoolsExists()
          .should.be.rejectedWith('not exist').then(() => {
            expect(requestStub.callCount).to.equal(2);
          });
      });

      it('should success if all of the specified pre-existing CUPs exist', () => {
        awsCompileCognitoUserPoolEvents.serverless.service.functions = {
          first: {
            events: [
              {
                cognitoUserPool: {
                  pool: 'arn:aws:cognito-idp:us-east-1:000123456789:userpool/us-east-1_abcd45678',
                  trigger: 'PreSignUp',
                  preExisting: true,
                },
              },
              {
                cognitoUserPool: {
                  pool: 'us-west-2_wxyz12345',
                  trigger: 'PreSignUp',
                  preExisting: true,
                },
              },
            ],
          },
        };

        requestStub.resolves('success');

        return awsCompileCognitoUserPoolEvents.ensureAllPreExistingCognitoUserPoolsExists()
          .should.be.fulfilled.then(() => {
            expect(requestStub.callCount).to.equal(2);
            expect(requestStub).to.have.been.calledWithExactly(
              'CognitoIdentityServiceProvider',
              'describeUserPool',
              {
                UserPoolId: 'us-east-1_abcd45678',
              },
              {
                useCache: true,
              });
            expect(requestStub).to.have.been.calledWithExactly(
              'CognitoIdentityServiceProvider',
              'describeUserPool',
              {
                UserPoolId: 'us-west-2_wxyz12345',
              },
              {
                useCache: true,
              });
          });
      });
    });
    describe('#addTriggerFunctionsToPreExistingUserPools', () => {
      // TODO
    });
    describe('#removeTriggerFunctionsFromPreExistingUserPools', () => {
      // TODO
    });
    describe('#infoTriggerFunctionsInPreExistingUserPools', () => {
      // TODO
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
