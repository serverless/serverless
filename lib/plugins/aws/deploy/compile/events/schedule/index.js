'use strict';

const merge = require('lodash').merge;

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;

    this.hooks = {
      'deploy:compileEvents': this.compileScheduledEvents.bind(this),
    };
  }

  compileScheduledEvents() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        for (let i = 0; i < functionObj.events.length; i++) {
          if (event.schedule) {
            let ScheduleExpression;
            let State;

            // TODO validate rate syntax
            if (typeof event.schedule === 'object') {
              if (!event.schedule.rate) {
                throw new this.serverless
                  .Error(`Missing "rate" property in schedule event in function ${functionName}`);
              }
              ScheduleExpression = event.schedule.rate;
              State = event.schedule.enabled ? 'ENABLED' : 'DISABLED';
            } else if (typeof event.schedule === 'string') {
              ScheduleExpression = event.schedule;
              State = 'ENABLED';
            } else {
              throw new this.serverless
                .Error(`Schedule event of function ${functionName} is not an object nor a string`)
            }


            const scheduleTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "ScheduleExpression": "${ScheduleExpression}",
                  "State": "${State}",
                  "Targets": [{
                    "Arn": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                    "Id": "${functionName}ScheduleEvent"
                  }]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "events.amazonaws.com",
                  "SourceArn": { "Fn::GetAtt": ["${functionName}ScheduleEvent${i}", "Arn"] }
                }
              }
            `;

            const newScheduleObject = {
              [`${functionName}ScheduleEvent${i}`]: JSON.parse(scheduleTemplate),
            };

            const newPermissionObject = {
              [`${functionName}ScheduleEventPermission${i}`]: JSON.parse(permissionTemplate),
            };

            merge(this.serverless.service.resources.aws.Resources,
              newScheduleObject, newPermissionObject);
          }
        }
      }

    });
  }
}

module.exports = AwsCompileScheduledEvents;
