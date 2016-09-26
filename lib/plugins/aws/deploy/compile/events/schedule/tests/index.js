'use strict';

const expect = require('chai').expect;
const AwsCompileScheduledEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileScheduledEvents', () => {
  let serverless;
  let awsCompileScheduledEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(serverless);
    awsCompileScheduledEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileScheduledEvents.provider)
      .to.equal('aws'));
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
      const inputParams = {
        a: 'a',
        b: [
          0,
          false,
        ],
      };

      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
                description: 'my description',
                input: inputParams,
              },
            },
            {
              schedule: {
                rate: 'rate(20 minutes)',
                enabled: true,
              },
            },
            {
              schedule: 'rate(30 minutes)',
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      const resources = awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources;

      const schedule1 = resources.FirstEventsRuleSchedule1;
      expect(schedule1.Type).to.equal('AWS::Events::Rule');
      expect(schedule1.Properties.State).to.equal('DISABLED');
      expect(schedule1.Properties.ScheduleExpression).to
        .equal('rate(10 minutes)');
      expect(schedule1.Properties.Description).to
        .equal('my description');
      expect(schedule1.Properties.Targets[0].Input).to
        .equal(JSON.stringify(inputParams));

      const schedule2 = resources.FirstEventsRuleSchedule2;
      expect(schedule2.Type).to.equal('AWS::Events::Rule');
      expect(schedule2.Properties.State).to.equal('ENABLED');
      expect(schedule2.Properties.Description).to
        .equal('Invoke lambda function \'first\' schedule at rate(20 minutes)');
      expect(schedule2.Properties.ScheduleExpression).to
        .equal('rate(20 minutes)');
      expect(schedule2.Properties.Targets[0].Input).to.equal('');

      const schedule3 = resources.FirstEventsRuleSchedule3;
      expect(schedule3.Type).to.equal('AWS::Events::Rule');
      expect(schedule3.Properties.State).to.equal('ENABLED');
      expect(schedule3.Properties.Description).to
        .equal('Invoke lambda function \'first\' schedule at rate(30 minutes)');
      expect(schedule3.Properties.ScheduleExpression)
        .to.equal('rate(30 minutes)');
      expect(schedule3.Properties.Targets[0].Input).to.equal('');

      expect(resources.FirstLambdaPermissionEventsRuleSchedule1.Type)
        .to.equal('AWS::Lambda::Permission');
      expect(resources.FirstLambdaPermissionEventsRuleSchedule2.Type)
        .to.equal('AWS::Lambda::Permission');
      expect(resources.FirstLambdaPermissionEventsRuleSchedule3.Type)
        .to.equal('AWS::Lambda::Permission');
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

    it('should throw a Error if "input" length is 8193', () => {
      const inputParams = [
        'a'.repeat('8189'),
      ];

      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                input: inputParams,
              },
            },
          ],
        },
      };

      expect(JSON.stringify(inputParams).length).to.equal(8193);
      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });
  });
});
