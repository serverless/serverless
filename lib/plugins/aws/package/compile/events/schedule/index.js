'use strict';

const _ = require('lodash');

const rateSyntaxPattern = /^rate\((?:1 (?:minute|hour|day)|(?:1\d+|[2-9]\d*) (?:minute|hour|day)s)\)$/;
const cronSyntaxPattern = /^cron\(\S+ \S+ \S+ \S+ \S+ \S+\)$/;

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileScheduledEvents.bind(this),
    };
  }

  buildValidationErrorMessage(functionName) {
    return [
      `"rate" property for schedule event is missing or invalid in function ${functionName}.`,
      ' The correct syntax is: `schedule: rate(10 minutes)`, `schedule: cron(0 12 * * ? *)`',
      ' OR an object with "rate" property.',
      ' Please check the docs for more info:',
      ' https://serverless.com/framework/docs/providers/aws/events/schedule/',
    ].join('');
  }

  compileScheduledEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
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
            let InputTransformer;
            let Name;
            let Description;

            if (typeof event.schedule === 'object') {
              if (!this.validateScheduleSyntax(event.schedule.rate)) {
                const errorMessage = this.buildValidationErrorMessage(functionName);
                throw new this.serverless.classes.Error(errorMessage);
              }
              ScheduleExpression = event.schedule.rate;
              State = 'ENABLED';
              if (event.schedule.enabled === false) {
                State = 'DISABLED';
              }
              Input = event.schedule.input;
              InputPath = event.schedule.inputPath;
              InputTransformer = event.schedule.inputTransformer;
              Name = event.schedule.name;
              Description = event.schedule.description;

              const inputOptions = [Input, InputPath, InputTransformer].filter(i => i);
              if (inputOptions.length > 1) {
                const errorMessage = [
                  'You can only set one of input, inputPath, or inputTransformer ',
                  'properties at the same time for schedule events. ',
                  'Please check the AWS docs for more info',
                ].join('');
                throw new this.serverless.classes.Error(errorMessage);
              }

              if (Input && typeof Input === 'object') {
                if (_.has(Input, 'body') && typeof Input.body === 'string') {
                  try {
                    Input.body = JSON.parse(Input.body);
                  } catch (error) {
                    const errorMessage = [
                      'The body of the schedule event associated with',
                      ` ${functionName} was passed as a string`,
                      ' but it failed to parse to a JSON object.',
                      ' Please check the docs for more info.',
                    ].join('');
                    throw new this.serverless.classes.Error(errorMessage);
                  }
                }
                Input = JSON.stringify(Input);
              }
              if (Input && typeof Input === 'string') {
                // escape quotes to favor JSON.parse
                Input = Input.replace(/\"/g, '\\"'); // eslint-disable-line
              }
              if (InputTransformer) {
                InputTransformer = this.formatInputTransformer(InputTransformer);
              }
            } else if (this.validateScheduleSyntax(event.schedule)) {
              ScheduleExpression = event.schedule;
              State = 'ENABLED';
            } else {
              const errorMessage = this.buildValidationErrorMessage(functionName);
              throw new this.serverless.classes.Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const scheduleLogicalId = this.provider.naming.getScheduleLogicalId(
              functionName,
              scheduleNumberInFunction
            );
            const lambdaPermissionLogicalId = this.provider.naming.getLambdaSchedulePermissionLogicalId(
              functionName,
              scheduleNumberInFunction
            );
            const scheduleId = this.provider.naming.getScheduleId(functionName);

            const scheduleTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "ScheduleExpression": "${ScheduleExpression}",
                  "State": "${State}",
                  ${Name ? `"Name": "${Name}",` : ''}
                  ${Description ? `"Description": "${Description}",` : ''}
                  "Targets": [{
                    ${Input ? `"Input": "${Input}",` : ''}
                    ${InputPath ? `"InputPath": "${InputPath}",` : ''}
                    ${InputTransformer ? `"InputTransformer": ${InputTransformer},` : ''}
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
                  "FunctionName": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
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

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newScheduleObject,
              newPermissionObject
            );
          }
        });
      }
    });
  }

  validateScheduleSyntax(input) {
    return (
      typeof input === 'string' && (rateSyntaxPattern.test(input) || cronSyntaxPattern.test(input))
    );
  }

  formatInputTransformer(inputTransformer) {
    if (!inputTransformer.inputTemplate) {
      throw new this.serverless.classes.Error(
        'The inputTemplate key is required when specifying an ' +
          'inputTransformer for a schedule event'
      );
    }
    const cfmOutput = {
      // InputTemplate is required
      InputTemplate: inputTransformer.inputTemplate,
    };
    // InputPathsMap is optional
    if (inputTransformer.inputPathsMap) {
      cfmOutput.InputPathsMap = inputTransformer.inputPathsMap;
    }
    return JSON.stringify(cfmOutput);
  }
}

module.exports = AwsCompileScheduledEvents;
