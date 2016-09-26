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
            let Description;
            let Input = '';

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
              Description = typeof event.schedule.description === 'string' ?
                event.schedule.description :
                `Invoke lambda function '${functionName}' schedule at ${event.schedule.rate}`;
              if (typeof event.schedule.input === 'object') {
                Input = JSON.stringify(event.schedule.input);
                if (Input.length > 8192) {
                  const errorMessage = [
                    'Validation error "input" property',
                    ` for schedule event in function ${functionName}`,
                    ' Length Constraints: Maximum length of 8192',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
              }
            } else if (typeof event.schedule === 'string') {
              ScheduleExpression = event.schedule;
              State = 'ENABLED';
              Description =
                `Invoke lambda function '${functionName}' schedule at ${event.schedule}`;
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

            const scheduleTemplate = {
              Type: 'AWS::Events::Rule',
              Properties: {
                Description: `${Description}`,
                ScheduleExpression: `${ScheduleExpression}`,
                State: `${State}`,
                Targets: [
                  {
                    Arn: {
                      'Fn::GetAtt': [
                        `${normalizedFunctionName}LambdaFunction`,
                        'Arn',
                      ],
                    },
                    Id: `${functionName}Schedule`,
                    Input: `${Input}`,
                  },
                ],
              },
            };

            const permissionTemplate = {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': [
                    `${normalizedFunctionName}LambdaFunction`,
                    'Arn',
                  ],
                },
                Action: 'lambda:InvokeFunction',
                Principal: 'events.amazonaws.com',
                SourceArn: {
                  'Fn::GetAtt': [
                    `${normalizedFunctionName}EventsRuleSchedule${scheduleNumberInFunction}`,
                    'Arn',
                  ],
                },
              },
            };

            const newScheduleObject = {
              [`${normalizedFunctionName}EventsRuleSchedule${
                scheduleNumberInFunction}`]: scheduleTemplate,
            };

            const newPermissionObject = {
              [`${normalizedFunctionName}LambdaPermissionEventsRuleSchedule${
                scheduleNumberInFunction}`]: permissionTemplate,
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
