'use strict';

const expect = require('chai').expect;
const AwsCompileScheduledEvents = require('../awsCompileScheduledEvents');
const Serverless = require('../../../Serverless');

describe('awsCompileScheduledEvents', () => {
  let serverless;
  let awsCompileScheduledEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    serverless.service.resources = { aws: { Resources: {} } };
    awsCompileScheduledEvents = new AwsCompileScheduledEvents(serverless);
    awsCompileScheduledEvents.serverless.service.service = 'new-service';
  });

  describe('#compileScheduledEvents()', () => {
    it('should throw an error if the aws resource is not available', () => {
      awsCompileScheduledEvents.serverless.service.resources.aws.Resources = false;
      expect(() => awsCompileScheduledEvents.compileScheduledEvents()).to.throw(Error);
    });

    it('should compile scheduled events into CF resources', () => {
      awsCompileScheduledEvents.serverless.service.functions = {
        hello: {
          events: {
            aws: {
              schedule: 'rate(10 minutes)',
            },
          },
        },
      };

      const scheduleResrouce = `
        {
          "Type": "AWS::Events::Rule",
          "Properties": {
            "ScheduleExpression": "rate(10 minutes)",
            "State": "ENABLED",
            "Targets": [{
              "Arn": { "Fn::GetAtt": ["hello", "Arn"] },
              "Id": "helloScheduleEvent"
            }]
          }
        }
      `;

      const permissionResource = `
        {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "FunctionName": { "Fn::GetAtt": ["hello", "Arn"] },
            "Action": "lambda:InvokeFunction",
            "Principal": "events.amazonaws.com",
            "SourceArn": { "Fn::GetAtt": ["helloScheduleEvent", "Arn"] }
          }
        }
       `;

      awsCompileScheduledEvents.compileScheduledEvents();

      expect(awsCompileScheduledEvents.serverless.service
        .resources.aws.Resources.helloScheduleEvent)
        .to.deep.equal(JSON.parse(scheduleResrouce));
      expect(awsCompileScheduledEvents.serverless.service
        .resources.aws.Resources.helloScheduleEventPermission)
        .to.deep.equal(JSON.parse(permissionResource));
    });
  });
});
