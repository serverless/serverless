'use strict';

const _ = require('lodash');

class AwsCompileCloudWatchLogEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileCloudWatchLogEvents.bind(this),
    };
  }

  compileCloudWatchLogEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let logsNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudwatchLog) {
            logsNumberInFunction++;
            let LogGroupName;
            let FilterPattern;

            if (typeof event.cloudwatchLog === 'object') {
              if (!event.cloudwatchLog.logGroup) {
                const errorMessage = [
                  'Missing "logGroup" or "filter" property for logs event ',
                  `in function ${functionName} Please check the docs for more info.`,
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              if (event.cloudwatchLog.filter && typeof event.cloudwatchLog.filter !== 'string') {
                const errorMessage = [
                  `"filter" property for logs event in function ${functionName} `,
                  'should be string. Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              LogGroupName = event.cloudwatchLog.logGroup.replace(/\r?\n/g, '');
              FilterPattern = event.cloudwatchLog.filter ?
                event.cloudwatchLog.filter.replace(/\r?\n/g, '') : '';
            } else {
              const errorMessage = [
                `logs event of function "${functionName}" is not an object`,
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);
            const cloudWatchLogLogicalId = this.provider.naming
              .getCloudWatchLogLogicalId(functionName, logsNumberInFunction);
            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaCloudWatchLogPermissionLogicalId(functionName,
                logsNumberInFunction);

            const cloudWatchLogRuleTemplate = `
              {
                "Type": "AWS::Logs::SubscriptionFilter",
                "DependsOn": "${lambdaPermissionLogicalId}",
                "Properties": {
                  "LogGroupName": "${LogGroupName}",
                  "FilterPattern": "${FilterPattern}",
                  "DestinationArn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] }
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
                  "Principal": {
                    "Fn::Join": [ "", [
                    "logs.",
                    { "Ref": "AWS::Region" },
                    ".amazonaws.com"
                    ] ]
                  },
                  "SourceArn": {
                    "Fn::Join": [ "", [
                    "arn:aws:logs:",
                    { "Ref": "AWS::Region" },
                    ":",
                    { "Ref": "AWS::AccountId" },
                    ":log-group:",
                    "${LogGroupName}",
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

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newCloudWatchLogRuleObject, newPermissionObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileCloudWatchLogEvents;
