'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../serverless-error');

const rateSyntax = '^rate\\((?:1 (?:minute|hour|day)|(?:1\\d+|[2-9]\\d*) (?:minute|hour|day)s)\\)$';
const cronSyntax = '^cron\\(\\S+ \\S+ \\S+ \\S+ \\S+ \\S+\\)$';
const scheduleSyntax = `${rateSyntax}|${cronSyntax}`;

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileScheduledEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'schedule', {
      anyOf: [
        { type: 'string', pattern: scheduleSyntax },
        {
          type: 'object',
          properties: {
            rate: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                pattern: scheduleSyntax,
              },
            },
            enabled: { type: 'boolean' },
            name: { type: 'string', minLength: 1, maxLength: 64, pattern: '[\\.\\-_A-Za-z0-9]+' },
            description: { type: 'string', maxLength: 512 },
            input: {
              anyOf: [
                { type: 'string', maxLength: 8192 },
                {
                  type: 'object',
                  oneOf: [
                    {
                      properties: {
                        body: { type: 'string', maxLength: 8192 },
                      },
                      required: ['body'],
                      additionalProperties: false,
                    },
                    {
                      not: {
                        required: ['body'],
                      },
                    },
                  ],
                },
              ],
            },
            inputPath: { type: 'string', maxLength: 256 },
            inputTransformer: {
              type: 'object',
              properties: {
                inputTemplate: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 8192,
                },
                inputPathsMap: { type: 'object' },
              },
              required: ['inputTemplate'],
              additionalProperties: false,
            },
          },
          required: ['rate'],
          additionalProperties: false,
        },
      ],
    });
  }

  compileScheduledEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let scheduleNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.schedule) {
            let ScheduleExpressions;
            let State;
            let Input;
            let InputPath;
            let InputTransformer;
            let Name;
            let Description;

            if (typeof event.schedule === 'object') {
              ScheduleExpressions = event.schedule.rate;

              State = 'ENABLED';
              if (event.schedule.enabled === false) {
                State = 'DISABLED';
              }
              Input = event.schedule.input;
              InputPath = event.schedule.inputPath;
              InputTransformer = event.schedule.inputTransformer;
              Name = event.schedule.name;
              Description = event.schedule.description;

              if (ScheduleExpressions.length > 1 && Name) {
                throw new ServerlessError(
                  'You cannot specify a name when defining more than one rate expression',
                  'SCHEDULE_NAME_NOT_ALLOWED_MULTIPLE_RATES'
                );
              }

              if (Input && typeof Input === 'object') {
                if (typeof Input.body === 'string') {
                  Input.body = JSON.parse(Input.body);
                }
                Input = JSON.stringify(Input);
              }
              if (Input && typeof Input === 'string') {
                // escape quotes to favor JSON.parse
                Input = Input.replace(/"/g, '\\"');
              }
              if (InputTransformer) {
                InputTransformer = this.formatInputTransformer(InputTransformer);
              }
            } else {
              ScheduleExpressions = [event.schedule];
              State = 'ENABLED';
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const scheduleId = this.provider.naming.getScheduleId(functionName);

            for (const ScheduleExpression of ScheduleExpressions) {
              scheduleNumberInFunction++;

              const scheduleLogicalId = this.provider.naming.getScheduleLogicalId(
                functionName,
                scheduleNumberInFunction
              );
              const lambdaPermissionLogicalId =
                this.provider.naming.getLambdaSchedulePermissionLogicalId(
                  functionName,
                  scheduleNumberInFunction
                );

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
          }
        });
      }
    });
  }

  formatInputTransformer(inputTransformer) {
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
