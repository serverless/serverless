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
    if (!this.serverless.service.resources.aws.Resources) {
      throw new this.serverless.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      // checking all three levels in the obj tree
      // to avoid "can't read property of undefined" error
      if (functionObj.events && functionObj.events.aws && functionObj.events.aws.schedule) {
        const scheduleTemplate = `
          {
            "Type": "AWS::Events::Rule",
            "Properties": {
              "ScheduleExpression": "${functionObj.events.aws.schedule}",
              "State": "ENABLED",
              "Targets": [{
                "Arn": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                "Id": "${functionName}Schedule"
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
              "SourceArn": { "Fn::GetAtt": ["${functionName}Schedule", "Arn"] }
            }
          }
        `;

        const newScheduleObject = {
          [`${functionName}Schedule`]: JSON.parse(scheduleTemplate),
        };

        const newPermissionObject = {
          [`${functionName}SchedulePermission`]: JSON.parse(permissionTemplate),
        };

        merge(this.serverless.service.resources.aws.Resources,
          newScheduleObject, newPermissionObject);
      }
    });
  }
}

module.exports = AwsCompileScheduledEvents;
