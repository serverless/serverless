'use strict';

const expect = require('chai').expect;
const AwsCompileAlexaSkillsKitEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileAlexaSkillsKitEvents', () => {
  let serverless;
  let awsCompileAlexaSkillsKitEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileAlexaSkillsKitEvents = new AwsCompileAlexaSkillsKitEvents(serverless);
    awsCompileAlexaSkillsKitEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () =>
      expect(
        awsCompileAlexaSkillsKitEvents.provider
      ).to.equal('aws'));
  });

  describe('#compileAlexaSkillsKitEvents()', () => {
    it('should throw an error if the resource section is not available', () => {
      awsCompileAlexaSkillsKitEvents.serverless.service.resources.Resources = false;
      expect(() => awsCompileAlexaSkillsKitEvents.compileAlexaSkillsKitEvents()).to.throw(Error);
    });

    it('should create corresponding resources when ask events are given', () => {
      awsCompileAlexaSkillsKitEvents.serverless.service.functions = {
        first: {
          events: [
            'ask',
          ],
        },
      };

      awsCompileAlexaSkillsKitEvents.compileAlexaSkillsKitEvents();

      expect(awsCompileAlexaSkillsKitEvents.serverless.service
        .resources.Resources.firstAlexaSkillsKitEventPermission0.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should not create corresponding resources when ask events are not given', () => {
      awsCompileAlexaSkillsKitEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileAlexaSkillsKitEvents.compileAlexaSkillsKitEvents();

      expect(
        awsCompileAlexaSkillsKitEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
