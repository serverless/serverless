'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../serverless-error');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

class AwsCompileCloudWatchLogEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': async () => this.compileCloudWatchLogEvents(),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'cloudwatchLog', {
      anyOf: [
        { $ref: '#/definitions/awsLogGroupName' },
        {
          type: 'object',
          properties: {
            logGroup: { $ref: '#/definitions/awsLogGroupName' },
            filter: { type: 'string' },
          },
          required: ['logGroup'],
          additionalProperties: false,
        },
      ],
    });
  }

  compileCloudWatchLogEvents() {
    const cloudWatchLogEventNumberMap = {};
    const CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT = 2;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let cloudWatchLogNumberInFunction = 0;

      if (functionObj.events) {
        const logGroupNamesThisFunction = [];

        functionObj.events.forEach((event) => {
          if (event.cloudwatchLog) {
            cloudWatchLogNumberInFunction++;
            let LogGroupName;
            let FilterPattern;

            if (typeof event.cloudwatchLog === 'object') {
              LogGroupName = event.cloudwatchLog.logGroup.replace(/\r?\n/g, '');
              FilterPattern = event.cloudwatchLog.filter
                ? event.cloudwatchLog.filter.replace(/\r?\n/g, '')
                : '';
            } else if (typeof event.cloudwatchLog === 'string') {
              LogGroupName = event.cloudwatchLog.replace(/\r?\n/g, '');
              FilterPattern = '';
            }

            cloudWatchLogEventNumberMap[LogGroupName] =
              cloudWatchLogEventNumberMap[LogGroupName] || 0;
            cloudWatchLogEventNumberMap[LogGroupName]++;
            if (
              cloudWatchLogEventNumberMap[LogGroupName] >
              CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT
            ) {
              const errorMessage = [
                `Only ${CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT} subscription filters can be configured per log group.`,
                ` You're attempting to configure more subscription filters than allowed for "${LogGroupName}".`,
              ].join('');
              throw new ServerlessError(
                errorMessage,
                'CLOUDWATCHLOG_LOG_GROUP_EVENT_PER_FUNCTION_LIMIT_EXCEEDED'
              );
            }
            logGroupNamesThisFunction.push(LogGroupName);

            const cloudWatchLogLogicalId = this.provider.naming.getCloudWatchLogLogicalId(
              functionName,
              cloudWatchLogNumberInFunction
            );
            const lambdaPermissionLogicalId =
              this.provider.naming.getLambdaCloudWatchLogPermissionLogicalId(functionName);

            // unescape quotes once when the first quote is detected escaped
            const idxFirstSlash = FilterPattern.indexOf('\\');
            const idxFirstQuote = FilterPattern.indexOf('"');
            if (idxFirstSlash >= 0 && idxFirstQuote >= 0 && idxFirstQuote > idxFirstSlash) {
              FilterPattern = FilterPattern.replace(/\\("|\\|')/g, (match, g) => g);
            }

            const dependsOn = [
              lambdaPermissionLogicalId,
              _.get(functionObj.targetAlias, 'logicalId'),
            ].filter(Boolean);

            const cloudWatchLogRuleTemplate = `
              {
                "Type": "AWS::Logs::SubscriptionFilter",
                ${dependsOn.length ? `"DependsOn": ${JSON.stringify(dependsOn)},` : ''}
                "Properties": {
                  "LogGroupName": "${LogGroupName}",
                  "FilterPattern": ${JSON.stringify(FilterPattern)},
                  "DestinationArn": ${JSON.stringify(
                    resolveLambdaTarget(functionName, functionObj)
                  )}
                }
              }
            `;

            const commonSuffixOfLogGroupName = this.longestCommonSuffix(logGroupNamesThisFunction);
            const permissionDependsOn = dependsOn.filter((s) => s !== lambdaPermissionLogicalId);

            const permissionTemplate = `
            {
              "Type": "AWS::Lambda::Permission",
              ${
                permissionDependsOn.length
                  ? `"DependsOn": ${JSON.stringify(permissionDependsOn)},`
                  : ''
              }
              "Properties": {
                "FunctionName": ${JSON.stringify(resolveLambdaTarget(functionName, functionObj))},
                "Action": "lambda:InvokeFunction",
                "Principal": {
                  "Fn::Join": [ "", [
                  "logs.",
                  { "Ref": "AWS::Region" },
                  ".amazonaws.com"
                  ] ]
                },
                "SourceArn": {
                  "Fn::Join": [ "", [
                  "arn:",
                  { "Ref": "AWS::Partition" },
                  ":logs:",
                  { "Ref": "AWS::Region" },
                  ":",
                  { "Ref": "AWS::AccountId" },
                  ":log-group:",
                  "${commonSuffixOfLogGroupName}",
                  ":*"
                  ] ]
                }
              }
            }
          `;

            const newCloudWatchLogRuleObject = {
              [cloudWatchLogLogicalId]: JSON.parse(cloudWatchLogRuleTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newCloudWatchLogRuleObject,
              newPermissionObject
            );
          }
        });
      }
    });
  }

  longestCommonSuffix(logGroupNames) {
    const first = logGroupNames[0];
    let longestCommon = logGroupNames.reduce((last, current) => {
      for (let i = 0; i < last.length; i++) {
        if (last[i] !== current[i]) {
          return last.substring(0, i);
        }
      }
      return last;
    }, first);

    if (logGroupNames.length > 1 && !longestCommon.endsWith('*')) {
      longestCommon += '*';
    }

    return longestCommon;
  }
}

module.exports = AwsCompileCloudWatchLogEvents;
