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
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRule1.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRule2.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstEventsRule3.Type
      ).to.equal('AWS::Events::Rule');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionEventsRule1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionEventsRule2.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileScheduledEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.FirstLambdaPermissionEventsRule3.Type
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
  });
});
