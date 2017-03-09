'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileAlexaSkillEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileAlexaSkillEvents', () => {
  let serverless;
  let awsCompileAlexaSkillEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileAlexaSkillEvents = new AwsCompileAlexaSkillEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileAlexaSkillEvents.provider).to.be.instanceof(AwsProvider));

    it('should should hook into the "deploy:compileEvents" hook', () =>
      expect(awsCompileAlexaSkillEvents.hooks['deploy:compileEvents']).to.not.equal(undefined));
  });

  describe('#compileAlexaSkillEvents()', () => {
    it('should throw an error if alexaSkill event is not an string', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSkill: 42,
            },
          ],
        },
      };

      expect(() => awsCompileAlexaSkillEvents.compileAlexaSkillEvents()).to.throw(Error);
    });

    it('should create corresponding resources when a alexaSkill event is provided', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            'alexaSkill',
          ],
        },
      };

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents();

      expect(awsCompileAlexaSkillEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexaSkill.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileAlexaSkillEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexaSkill.Properties.FunctionName
      ).to.deep.equal({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] });
      expect(awsCompileAlexaSkillEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexaSkill.Properties.Action
      ).to.equal('lambda:InvokeFunction');
      expect(awsCompileAlexaSkillEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionAlexaSkill.Properties.Principal
      ).to.equal('alexa-appkit.amazon.com');
    });

    it('should not create corresponding resources when alexaSkill event is not given', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents();

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });
  });
});
