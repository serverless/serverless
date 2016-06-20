'use strict';

const expect = require('chai').expect;
const AwsCompileScheduledEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('awsCompileScheduledEvents', () => {
  let serverless;
  let awsCompileScheduledEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(serverless);
    awsCompileScheduledEvents.serverless.service.service = 'new-service';
  });

  describe('#compileScheduledEvents()', () => {
    it('should throw an error if the aws resource is not available', () => {
      awsCompileScheduledEvents.serverless.service.resources.Resources = false;
      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });

    it('should create corresponding resources when scheduled events are simple strings', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        hello: {
          events: [
            {
              schedule: 'rate(10 minutes)',
            },
          ],
        },
      };

      const scheduleResource = `
        {
          "Type": "AWS::Events::Rule",
          "Properties": {
            "ScheduleExpression": "rate(10 minutes)",
            "State": "ENABLED",
            "Targets": [{
              "Arn": {
                "Fn::GetAtt": ["hello", "Arn"]
              },
              "Id": "helloScheduleEvent"
            }]
          }
        }
      `;

      const permissionResource = `
        {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "FunctionName": {
              "Fn::GetAtt": ["hello", "Arn"]
            },
            "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com",
            "SourceArn": {
              "Fn::GetAtt": ["helloScheduleEvent0", "Arn"]
            }
          }
        }
      `;

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.helloScheduleEvent0)
        .to.deep.equal(JSON.parse(scheduleResource));
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.helloScheduleEventPermission0)
        .to.deep.equal(JSON.parse(permissionResource));
    });

    it('should create corresponding resources when S3 events are given as objects', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        hello: {
          events: [
            {
              schedule: {
                rate: 'rate(10 minutes)',
                enabled: false,
              },
            },
          ],
        },
      };

      const scheduleResource = `
        {
          "Type": "AWS::Events::Rule",
          "Properties": {
            "ScheduleExpression": "rate(10 minutes)",
            "State": "DISABLED",
            "Targets": [{
              "Arn": {
                "Fn::GetAtt": ["hello", "Arn"]
              },
              "Id": "helloScheduleEvent"
            }]
          }
        }
      `;

      const permissionResource = `
        {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "FunctionName": {
              "Fn::GetAtt": ["hello", "Arn"]
            },
            "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com",
            "SourceArn": {
              "Fn::GetAtt": ["helloScheduleEvent0", "Arn"]
            }
          }
        }
      `;

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.helloScheduleEvent0)
        .to.deep.equal(JSON.parse(scheduleResource));
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.helloScheduleEventPermission0)
        .to.deep.equal(JSON.parse(permissionResource));
    });

    it('should not create corresponding resources when scheduled events are not given', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
          events: {
          },
        },
      };

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(
        awsCompileScheduledEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });
  });
});
