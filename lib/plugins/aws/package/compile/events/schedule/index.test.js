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
            {
              schedule: 'cron(5,35 12 ? * 6l 2002-2005)',
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
    });

    it('should respect enabled variable, defaulting to true', () => {
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
              schedule: {
                rate: 'rate(10 minutes)',
              },
            },
            {
              schedule: 'rate(10 minutes)',
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
    });

    it('should respect name variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
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

    it('should respect description variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                description: 'your scheduled event description',
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

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].InputPath
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

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].Input
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

      expect(
        awsCompileScheduledEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstEventsRuleSchedule1.Properties.Targets[0].Input
      ).to.equal('{"key":"value"}');
    });

    it('should respect inputTransformer variable', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
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
