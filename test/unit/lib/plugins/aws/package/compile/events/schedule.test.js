'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileScheduledEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/schedule');
const Serverless = require('../../../../../../../../lib/Serverless');
const ServerlessError = require('../../../../../../../../lib/serverless-error');

// TODO: these tests should be eventually updated to use the newer runServerless approach
// Reference: https://github.com/serverless/test/blob/master/docs/run-serverless.md

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
    it('should create corresponding resources when schedule events are given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
              },
            },
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: true,
              },
            },
            {
              schedule: 'rate(10 minutes)',
            },
            {
              schedule: 'cron(5,35 12 ? * 6l 2002-2005)',
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Type
      ).to.equal('AWS::Events::Rule');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Type
      ).to.equal('AWS::Events::Rule');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Type
      ).to.equal('AWS::Events::Rule');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule2.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule4.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule5.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaPermissionEventsRuleSchedule6.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should respect enabled variable, defaulting to true', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
              },
            },
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: true,
              },
            },
            {
              schedule: {
                rate: ['rate(10 minutes)'],
              },
            },
            {
              schedule: 'rate(10 minutes)',
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                enabled: false,
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.State
      ).to.equal('DISABLED');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.State
      ).to.equal('ENABLED');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.State
      ).to.equal('ENABLED');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule4.Properties.State
      ).to.equal('ENABLED');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule5.Properties.State
      ).to.equal('DISABLED');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule6.Properties.State
      ).to.equal('DISABLED');
    });

    it('should respect name variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                name: 'your-scheduled-event-name',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Name
      ).to.equal('your-scheduled-event-name');
    });

    it('should throw an error if a name is specified when defining more than one rate expression', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                enabled: false,
                name: 'your-scheduled-event-name',
              },
            },
          ],
        },
      };

      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(ServerlessError);
    });

    it('should respect description variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                description: 'your scheduled event description',
              },
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                description: 'your scheduled event description (array)',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Description
      ).to.equal('your scheduled event description');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.Description
      ).to.equal('your scheduled event description (array)');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.Description
      ).to.equal('your scheduled event description (array)');
    });

    it('should respect inputPath variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                inputPath: '$.stageVariables',
              },
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                inputPath: '$.stageVariables',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.Targets[0].InputPath
      ).to.equal('$.stageVariables');
    });

    it('should respect input variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                input: '{"key":"value"}',
              },
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                input: '{"key":"value"}',
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect input variable as an object', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                input: {
                  key: 'value',
                },
              },
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                input: {
                  key: 'value',
                },
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect inputTransformer variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: ['rate(10 minutes)'],
                enabled: false,
                inputTransformer: {
                  inputPathsMap: {
                    eventTime: '$.time',
                  },
                  inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                },
              },
            },
            {
              schedule: {
                rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
                inputTransformer: {
                  inputPathsMap: {
                    eventTime: '$.time',
                  },
                  inputTemplate: '{"time": <eventTime>, "key1": "value1"}',
                },
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].InputTransformer
      ).to.eql({
        InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        InputPathsMap: { eventTime: '$.time' },
      });
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule2.Properties.Targets[0].InputTransformer
      ).to.eql({
        InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        InputPathsMap: { eventTime: '$.time' },
      });
      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule3.Properties.Targets[0].InputTransformer
      ).to.eql({
        InputTemplate: '{"time": <eventTime>, "key1": "value1"}',
        InputPathsMap: { eventTime: '$.time' },
      });
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
