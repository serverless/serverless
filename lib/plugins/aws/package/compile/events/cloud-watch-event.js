'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../serverless-error');

class AwsCompileCloudWatchEventEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileCloudWatchEventEvents.bind(this),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'cloudwatchEvent', {
      type: 'object',
      properties: {
        event: { type: 'object' },
        input: {
          anyOf: [{ type: 'string', maxLength: 8192 }, { type: 'object' }],
        },
        inputPath: { type: 'string', minLength: 1, maxLength: 256 },
        inputTransformer: {
          type: 'object',
          properties: {
            inputPathsMap: {
              type: 'object',
              additionalProperties: { type: 'string', minLength: 1 },
            },
            inputTemplate: { type: 'string', minLength: 1, maxLength: 8192 },
          },
          required: ['inputTemplate'],
          additionalProperties: false,
        },
        description: { type: 'string', maxLength: 512 },
        name: { type: 'string', pattern: '[a-zA-Z0-9-_.]+', minLength: 1, maxLength: 64 },
        enabled: { type: 'boolean' },
      },
      additionalProperties: false,
    });
  }

  compileCloudWatchEventEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let cloudWatchEventNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cloudwatchEvent) {
            cloudWatchEventNumberInFunction++;
            let State;
            let Input;
            let InputTransformer;

            const EventPattern = JSON.stringify(event.cloudwatchEvent.event);
            State = 'ENABLED';
            if (event.cloudwatchEvent.enabled === false) {
              State = 'DISABLED';
            }
            const Name = event.cloudwatchEvent.name;
            const InputPath = event.cloudwatchEvent.inputPath;
            const Description = event.cloudwatchEvent.description;
            Input = event.cloudwatchEvent.input;
            InputTransformer = event.cloudwatchEvent.inputTransformer;

            if ([Input, InputPath, InputTransformer].filter(Boolean).length > 1) {
              throw new ServerlessError(
                [
                  'You can only set one of input, inputPath, or inputTransformer ',
                  'properties at the same time for cloudwatch events. ',
                  'Please check the AWS docs for more info',
                ].join(''),
                'CLOUDWATCH_MULTIPLE_INPUT_PROPERTIES'
              );
            }

            if (Input && typeof Input === 'object') {
              Input = JSON.stringify(Input);
            }
            if (Input && typeof Input === 'string') {
              // escape quotes to favor JSON.parse
              Input = Input.replace(/"/g, '\\"');
            }
            if (InputTransformer) {
              InputTransformer = this.formatInputTransformer(InputTransformer);
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const cloudWatchLogicalId = this.provider.naming.getCloudWatchEventLogicalId(
              functionName,
              cloudWatchEventNumberInFunction
            );
            const lambdaPermissionLogicalId =
              this.provider.naming.getLambdaCloudWatchEventPermissionLogicalId(
                functionName,
                cloudWatchEventNumberInFunction
              );
            const cloudWatchId = this.provider.naming.getCloudWatchEventId(functionName);

            const cloudWatchEventRuleTemplate = `
              {
                "Type": "AWS::Events::Rule",
                "Properties": {
                  "EventPattern": ${EventPattern.replace(/\\n|\\r/g, '')},
                  "State": "${State}",
                  ${Description ? `"Description": "${Description}",` : ''}
                  ${Name ? `"Name": "${Name}",` : ''}
                  "Targets": [{
                    ${Input ? `"Input": "${Input.replace(/\\n|\\r/g, '')}",` : ''}
                    ${InputPath ? `"InputPath": "${InputPath.replace(/\r?\n/g, '')}",` : ''}
                    ${InputTransformer ? `"InputTransformer": ${InputTransformer},` : ''}
                    "Arn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                    "Id": "${cloudWatchId}"
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
                  "SourceArn": { "Fn::GetAtt": ["${cloudWatchLogicalId}", "Arn"] }
                }
              }
            `;

            const newCloudWatchEventRuleObject = {
              [cloudWatchLogicalId]: JSON.parse(cloudWatchEventRuleTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newCloudWatchEventRuleObject,
              newPermissionObject
            );
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

module.exports = AwsCompileCloudWatchEventEvents;
