'use strict';

const _ = require('lodash');

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileScheduledEvents.bind(this),
    };
  }

  compileScheduledEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let scheduleNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.schedule) {
            scheduleNumberInFunction++;
            let ScheduleExpression;
            let State;

            // TODO validate rate syntax
            if (typeof event.schedule === 'object') {
              if (!event.schedule.rate) {
                const errorMessage = [
                  `Missing "rate" property for schedule event in function ${functionName}`,
                  ' The correct syntax is: schedule: rate(10 minutes)',
                  ' OR an object with "rate" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              ScheduleExpression = event.schedule.rate;
              State = event.schedule.enabled ? 'ENABLED' : 'DISABLED';
            } else if (typeof event.schedule === 'string') {
              ScheduleExpression = event.schedule;
              State = 'ENABLED';
            } else {
              const errorMessage = [
                `Schedule event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: schedule: rate(10 minutes)',
                ' OR an object with "rate" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);

            const scheduleTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "ScheduleExpression": "${ScheduleExpression}",
                  "State": "${State}",
                  "Targets": [{
                    "Arn": { "Fn::GetAtt": ["${normalizedFunctionName}LambdaFunction", "Arn"] },
                    "Id": "${functionName}Schedule"
                  }]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${
              normalizedFunctionName}LambdaFunction", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "events.amazonaws.com",
                  "SourceArn": { "Fn::GetAtt": ["${
              normalizedFunctionName}EventsRule${scheduleNumberInFunction}", "Arn"] }
                }
              }
            `;

            const newScheduleObject = {
              [`${normalizedFunctionName}EventsRule${
                scheduleNumberInFunction}`]: JSON.parse(scheduleTemplate),
            };

            const newPermissionObject = {
              [`${normalizedFunctionName}LambdaPermissionEventsRule${
                scheduleNumberInFunction}`]: JSON.parse(permissionTemplate),
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newScheduleObject, newPermissionObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileScheduledEvents;
