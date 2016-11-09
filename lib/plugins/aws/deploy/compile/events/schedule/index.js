'use strict';

const _ = require('lodash');

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

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
            let Input;
            let InputPath;

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
              Input = event.schedule.input;
              InputPath = event.schedule.inputPath;

              if (Input && InputPath) {
                const errorMessage = [
                  'You can\'t set both input & inputPath properties at the',
                  'same time for schedule events.',
                  'Please check the AWS docs for more info',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              if (Input && typeof Input === 'object') {
                Input = JSON.stringify(Input);
              }
              if (Input && typeof Input === 'string') {
                // escape quotes to favor JSON.parse
                Input = Input.replace(/\"/g, '\\"'); // eslint-disable-line
              }
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

            const lambdaLogicalId = this.provider.naming
              .getLogicalLambdaName(functionName);
            const scheduleLogicalId = this.provider.naming
              .getCloudWatchEventName(functionName, scheduleNumberInFunction);
            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaCloudWatchEventPermissionName(functionName, scheduleNumberInFunction);
            const scheduleId = this.provider.naming.getCloudWatchEventId(functionName);

            const scheduleTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "ScheduleExpression": "${ScheduleExpression}",
                  "State": "${State}",
                  "Targets": [{
                    ${Input ? `"Input": "${Input}",` : ''}
                    ${InputPath ? `"InputPath": "${InputPath}",` : ''}
                    "Arn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                    "Id": "${scheduleId}"
                  }]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${
              lambdaLogicalId}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "events.amazonaws.com",
                  "SourceArn": { "Fn::GetAtt": ["${scheduleLogicalId}", "Arn"] }
                }
              }
            `;

            const newScheduleObject = {
              [scheduleLogicalId]: JSON.parse(scheduleTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
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
