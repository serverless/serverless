'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileScheduledEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileScheduledEvents', () => {
  let serverless;
  let awsCompileScheduledEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(serverless);
    awsCompileScheduledEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileScheduledEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileScheduledEvents()', () => {
    it('should throw an error if schedule event type is not a string or an object', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: 42,
            },
          ],
        },
      };

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });

    it('should throw an error if the "rate" property is not given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: null,
              },
            },
          ],
        },
      };

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });

    it('should create corresponding resources when schedule events are given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
              },
            },
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: true,
              },
            },
            {
              schedule: 'rate(10 minutes)',
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule2.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule3.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionEventsRuleSchedule1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionEventsRuleSchedule2.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .FirstLambdaPermissionEventsRuleSchedule3.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect inputPath variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1
        .Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
    });

    it('should respect input variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                input: '{"key":"value"}',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1
        .Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect input variable as an object', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                input: {
                  key: 'value',
                },
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1
        .Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should throw an error when both Input and InputPath are set', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                input: {
                  key: 'value',
                },
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });

    it('should not create corresponding resources when scheduled events are not given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
