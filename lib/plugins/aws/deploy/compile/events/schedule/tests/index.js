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

    it('should create corresponding resources when scheduled events are simple strings', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
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
                "Fn::GetAtt": ["first", "Arn"]
              },
              "Id": "firstScheduleEvent"
            }]
          }
        }
      `;

      const permissionResource = `
        {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "FunctionName": {
              "Fn::GetAtt": ["first", "Arn"]
            },
            "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com",
            "SourceArn": {
              "Fn::GetAtt": ["firstScheduleEvent0", "Arn"]
            }
          }
        }
      `;

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEvent0)
        .to.deep.equal(JSON.parse(scheduleResource));
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEventPermission0)
        .to.deep.equal(JSON.parse(permissionResource));
    });

    it('should create corresponding resources when S3 events are given as objects', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        first: {
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
                "Fn::GetAtt": ["first", "Arn"]
              },
              "Id": "firstScheduleEvent"
            }]
          }
        }
      `;

      const permissionResource = `
        {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "FunctionName": {
              "Fn::GetAtt": ["first", "Arn"]
            },
            "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com",
            "SourceArn": {
              "Fn::GetAtt": ["firstScheduleEvent0", "Arn"]
            }
          }
        }
      `;

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEvent0)
        .to.deep.equal(JSON.parse(scheduleResource));
      expect(awsCompileScheduledEvents.serverless.service
        .resources.Resources.firstScheduleEventPermission0)
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
