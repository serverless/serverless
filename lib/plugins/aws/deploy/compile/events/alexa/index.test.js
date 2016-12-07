'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileAlexaEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileAlexaEvents', () => {
  let serverless;
  let awsCompileAlexaEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileAlexaEvents = new AwsCompileAlexaEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileAlexaEvents.provider).to.be.instanceof(AwsProvider));

    it('should should hook into the "deploy:compileEvents" hook', () =>
      expect(awsCompileAlexaEvents.hooks['deploy:compileEvents']).to.not.equal(undefined));
  });

  describe('#compileAlexaEvents()', () => {
    it('should throw an error if alexa event type is not a boolean', () => {
      awsCompileAlexaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexa: 42,
            },
          ],
        },
      };

      expect(() => awsCompileAlexaEvents.compileAlexaEvents()).to.throw(Error);
    });

    it('should create corresponding resources when event is given with value "true"', () => {
      awsCompileAlexaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexa: true,
            },
          ],
        },
      };

      awsCompileAlexaEvents.compileAlexaEvents();

      expect(awsCompileAlexaEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexa.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileAlexaEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexa.Properties.FunctionName
      ).to.deep.equal({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] });
      expect(awsCompileAlexaEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexa.Properties.Action
      ).to.equal('lambda:InvokeFunction');
      expect(awsCompileAlexaEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexa.Properties.Principal
      ).to.equal('alexa-appkit.amazon.com');
    });

    it('should not create corresponding resources when event is given with value "false"', () => {
      awsCompileAlexaEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexa: false,
            },
          ],
        },
      };

      awsCompileAlexaEvents.compileAlexaEvents();

      expect(
        awsCompileAlexaEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });

    it('should not create corresponding resources when alexa event is not given', () => {
      awsCompileAlexaEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileAlexaEvents.compileAlexaEvents();

      expect(
        awsCompileAlexaEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
