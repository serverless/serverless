'use strict';

/* eslint-disable no-unused-expressions */

const expect = require('chai').expect;
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileAlexaSkillEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/alexaSkill');
const Serverless = require('../../../../../../../../lib/Serverless');

describe('AwsCompileAlexaSkillEvents', () => {
  let serverless;
  let awsCompileAlexaSkillEvents;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileAlexaSkillEvents = new AwsCompileAlexaSkillEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileAlexaSkillEvents.provider).to.be.instanceof(AwsProvider));

    it('should should hook into the "deploy:compileEvents" hook', () =>
      expect(awsCompileAlexaSkillEvents.hooks['package:compileEvents']).to.not.equal(undefined));
  });

  describe('#compileAlexaSkillEvents()', () => {
    it('should create corresponding resources when multiple alexaSkill events are provided', () => {
      const skillId1 = 'amzn1.ask.skill.xx-xx-xx-xx';
      const skillId2 = 'amzn1.ask.skill.yy-yy-yy-yy';
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSkill: skillId1,
            },
            {
              alexaSkill: {
                appId: skillId2,
              },
            },
          ],
        },
      };

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents();

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.FunctionName
      ).to.deep.equal({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] });
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.Action
      ).to.equal('lambda:InvokeFunction');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.Principal
      ).to.equal('alexa-appkit.amazon.com');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.EventSourceToken
      ).to.equal(skillId1);

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill2.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill2.Properties.FunctionName
      ).to.deep.equal({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] });
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill2.Properties.Action
      ).to.equal('lambda:InvokeFunction');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill2.Properties.Principal
      ).to.equal('alexa-appkit.amazon.com');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill2.Properties.EventSourceToken
      ).to.equal(skillId2);
    });

    it('should create corresponding resources when a disabled alexaSkill event is provided', () => {
      const skillId1 = 'amzn1.ask.skill.xx-xx-xx-xx';
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              alexaSkill: {
                appId: skillId1,
                enabled: false,
              },
            },
          ],
        },
      };

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents();

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.FunctionName
      ).to.deep.equal({ 'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'] });
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.Action
      ).to.equal('lambda:DisableInvokeFunction');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.Principal
      ).to.equal('alexa-appkit.amazon.com');
      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionAlexaSkill1.Properties.EventSourceToken
      ).to.equal(skillId1);
    });

    it('should not create corresponding resources when alexaSkill event is not given', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileAlexaSkillEvents.compileAlexaSkillEvents();

      expect(
        awsCompileAlexaSkillEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });

    it('should not not throw error when other events are present', () => {
      awsCompileAlexaSkillEvents.serverless.service.functions = {
        first: {
          events: [
            {
              http: {
                method: 'get',
                path: '/',
              },
            },
          ],
        },
      };

      expect(() => awsCompileAlexaSkillEvents.compileAlexaSkillEvents()).to.not.throw();
    });
  });
});
