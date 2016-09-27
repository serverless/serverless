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

    it('should populate description/input params', () => {
      const inputParams = {
        a: 'a',
        b: [
          1,
          false,
        ],
      };

      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: {
                rate: 'rate(20 minutes)',
                description: 'my description',
                input: inputParams,
              },
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      const schedule1 = awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1;

      expect(schedule1.Type).to.eq('AWS::Events::Rule');
      expect(schedule1.Properties.Description).to.eq('my description');
      expect(schedule1.Properties.Targets[0].Input).to.eq(JSON.stringify(inputParams));
    });

    it('should not populate description/input params when event does contains that params',
      () => {
        awsCompileScheduledEvents.serverless.service.functions = {
          first: {
            events: [
              {
                schedule: {
                  rate: 'rate(20 minutes)',
                },
              },
            ],
          },
        };

        awsCompileScheduledEvents.compileScheduledEvents();

        const schedule1 = awsCompileScheduledEvents.serverless.service
          .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1;

        expect(schedule1.Type).to.eq('AWS::Events::Rule');
        expect(schedule1.Properties.Description).to
          .eq('Invoke lambda function \'first\' schedule at rate(20 minutes)');
        expect(schedule1.Properties.Targets[0].Input).to.eq('');
      });

    it('should not populate description/input params when schedule event is string object', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: [
            {
              schedule: 'rate(20 minutes)',
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      const schedule1 = awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRuleSchedule1;

      expect(schedule1.Type).to.eq('AWS::Events::Rule');
      expect(schedule1.Properties.Description).to
        .eq('Invoke lambda function \'first\' schedule at rate(20 minutes)');
      expect(schedule1.Properties.Targets[0].Input).to.eq('');
    });

    it('should throw a Error if input length is 8193', () => {
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
