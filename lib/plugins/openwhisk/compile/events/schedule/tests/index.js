'use strict';

const expect = require('chai').expect;
const AwsCompileScheduledEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileScheduledEvents', () => {
  let serverless;
  let awsCompileScheduledEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(serverless);
    awsCompileScheduledEvents.serverless.service.service = 'new-service';
  });

  describe('#compileScheduledEvents()', () => {
    it('should throw an error if the resource section is not available', () => {
      awsCompileScheduledEvents.serverless.service.resources.Resources = false;
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
              schedule: 'rate(10 minutes)',
            },
          ],
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEvent0.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEvent1.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEventPermission0.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEventPermission1.Type
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
        awsCompileScheduledEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
