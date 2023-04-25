'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../serverless-error');
const TIME_ZONES = require('./schedule.timezones');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

const rateSyntax = '^rate\\((?:1 (?:minute|hour|day)|(?:1\\d+|[2-9]\\d*) (?:minute|hour|day)s)\\)$';
const cronSyntax = '^cron\\(\\S+ \\S+ \\S+ \\S+ \\S+ \\S+\\)$';
const scheduleSyntax = `${rateSyntax}|${cronSyntax}`;

class AwsCompileScheduledEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': async () => this.compileScheduledEvents(),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'schedule', {
      anyOf: [
        { type: 'string', pattern: scheduleSyntax },
        {
          title: 'EventbusSchedule',
          type: 'object',
          properties: {
            rate: {
              type: 'array',
              minItems: 1,
              items: {
                anyOf: [
                  { $ref: '#/definitions/awsCfFunction' },
                  {
                    type: 'string',
                    pattern: scheduleSyntax,
                  },
                ],
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
            method: {
              type: 'string',
              enum: ['eventBus'],
            },
          },
          required: ['rate'],
          additionalProperties: false,
        },
        {
          title: 'EventbridgeSchedulerSchedule',
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
            method: {
              type: 'string',
              enum: ['scheduler'],
            },
            timezone: {
              type: 'string',
              enum: TIME_ZONES,
            },
          },
          required: ['rate', 'method'],
          additionalProperties: false,
        },
      ],
    });
  }

  compileScheduledEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let scheduleNumberInFunction = 0;
      const functionRole = this.provider.naming.getRoleName();

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
            let method;
            let roleArn;
            let timezone;

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
              timezone = event.schedule.timezone;
              Description = event.schedule.description;
              roleArn = {
                'Fn::GetAtt': [functionRole, 'Arn'],
              };

              method = 'eventBus';
              if (event.schedule.method === 'scheduler') {
                method = 'scheduler';
              }

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
              if (Input && typeof Input === 'string' && method !== 'scheduler') {
                // escape quotes to favor JSON.parse
                Input = Input.replace(/"/g, '\\"');
              }
              if (InputTransformer) {
                if (method === 'scheduler') {
                  throw new ServerlessError(
                    'Cannot setup "schedule" event: "inputTransformer" is not supported with "scheduler" mode',
                    'SCHEDULE_PARAMETER_NOT_SUPPORTED'
                  );
                } else {
                  InputTransformer = this.formatInputTransformer(InputTransformer);
                }
              }
              if (InputPath && method === 'scheduler') {
                throw new ServerlessError(
                  'Cannot setup "schedule" event: "inputPath" is not supported with "scheduler" mode',
                  'SCHEDULE_PARAMETER_NOT_SUPPORTED'
                );
              }
            } else {
              ScheduleExpressions = [event.schedule];
              State = 'ENABLED';
            }

            const lambdaTarget = resolveLambdaTarget(functionName, functionObj);
            const lambdaTargetJson = JSON.stringify(lambdaTarget);
            const dependsOn =
              functionObj && functionObj.targetAlias
                ? functionObj.targetAlias.logicalId
                : undefined;

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

              let templateScheduleExpression;
              if (typeof ScheduleExpression === 'string') {
                templateScheduleExpression = `"${ScheduleExpression}"`;
              } else {
                templateScheduleExpression = JSON.stringify(ScheduleExpression);
              }

              let scheduleTemplate;

              if (method === 'scheduler') {
                const targetObj = {
                  Arn: lambdaTarget,
                  RoleArn: roleArn,
                };
                if (Input) {
                  Object.assign(targetObj, { Input });
                }

                const properties = {
                  ScheduleExpression,
                  State,
                  Target: targetObj,
                  FlexibleTimeWindow: {
                    Mode: 'OFF',
                  },
                };
                if (Name) {
                  Object.assign(properties, { Name });
                }
                if (Description) {
                  Object.assign(properties, { Description });
                }
                if (timezone) {
                  Object.assign(properties, { ScheduleExpressionTimezone: timezone });
                }

                scheduleTemplate = {
                  Type: 'AWS::Scheduler::Schedule',
                  Properties: properties,
                };
              } else {
                scheduleTemplate = `
                  {
                    "Type": "AWS::Events::Rule",
                    ${dependsOn ? `"DependsOn": "${dependsOn}",` : ''}
                    "Properties": {
                      "ScheduleExpression": ${templateScheduleExpression},
                      "State": "${State}",
                      ${Name ? `"Name": "${Name}",` : ''}
                      ${Description ? `"Description": "${Description}",` : ''}
                      "Targets": [{
                        ${Input ? `"Input": "${Input}",` : ''}
                        ${InputPath ? `"InputPath": "${InputPath}",` : ''}
                        ${InputTransformer ? `"InputTransformer": ${InputTransformer},` : ''}
                        "Arn": ${lambdaTargetJson},
                        "Id": "${scheduleId}"
                      }]
                    }
                  }
                `;
              }

              const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                ${dependsOn ? `"DependsOn": "${dependsOn}",` : ''}
                "Properties": {
                  "FunctionName": ${lambdaTargetJson},
                  "Action": "lambda:InvokeFunction",
                  "Principal": "events.amazonaws.com",
                  "SourceArn": { "Fn::GetAtt": ["${scheduleLogicalId}", "Arn"] }
                }
              }
            `;

              const newScheduleObject = {
                [scheduleLogicalId]:
                  method === 'scheduler' ? scheduleTemplate : JSON.parse(scheduleTemplate),
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
