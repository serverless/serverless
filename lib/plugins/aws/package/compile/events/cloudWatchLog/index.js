'use strict';

const _ = require('lodash');

class AwsCompileCloudWatchLogEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileCloudWatchLogEvents.bind(this),
    };
  }

  compileCloudWatchLogEvents() {
    const logGroupNames = [];

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let cloudWatchLogNumberInFunction = 0;

      if (functionObj.events) {
        const logGroupNamesThisFunction = [];

        functionObj.events.forEach(event => {
          if (event.cloudwatchLog) {
            cloudWatchLogNumberInFunction++;
            let LogGroupName;
            let FilterPattern;

            if (typeof event.cloudwatchLog === 'object') {
              if (!event.cloudwatchLog.logGroup) {
                const errorMessage = [
                  'Missing "logGroup" property for cloudwatchLog event ',
                  `in function ${functionName} Please check the docs for more info.`,
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              if (event.cloudwatchLog.filter && typeof event.cloudwatchLog.filter !== 'string') {
                const errorMessage = [
                  `"filter" property for cloudwatchLog event in function ${functionName} `,
                  'should be string. Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }

              LogGroupName = event.cloudwatchLog.logGroup.replace(/\r?\n/g, '');
              FilterPattern = event.cloudwatchLog.filter ?
                event.cloudwatchLog.filter.replace(/\r?\n/g, '') : '';
            } else if (typeof event.cloudwatchLog === 'string') {
              LogGroupName = event.cloudwatchLog.replace(/\r?\n/g, '');
              FilterPattern = '';
            } else {
              const errorMessage = [
                `cloudwatchLog event of function "${functionName}" is not an object or a string`,
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            if (_.indexOf(logGroupNames, LogGroupName) !== -1) {
              const errorMessage = [
                `"${LogGroupName}" logGroup for cloudwatchLog event is duplicated.`,
                ' This property can only be set once per CloudFormation stack.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }
            logGroupNames.push(LogGroupName);
            logGroupNamesThisFunction.push(LogGroupName);

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);
            const cloudWatchLogLogicalId = this.provider.naming
              .getCloudWatchLogLogicalId(functionName, cloudWatchLogNumberInFunction);
            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaCloudWatchLogPermissionLogicalId(functionName);

            // unescape quotes once when the first quote is detected escaped
            const idxFirstSlash = FilterPattern.indexOf('\\');
            const idxFirstQuote = FilterPattern.indexOf('"');
            if (idxFirstSlash >= 0 && idxFirstQuote >= 0 && idxFirstQuote > idxFirstSlash) {
              FilterPattern = FilterPattern.replace(/\\("|\\|')/g, (match, g) => g);
            }

            const cloudWatchLogRuleTemplate = `
              {
                "Type": "AWS::Logs::SubscriptionFilter",
                "DependsOn": "${lambdaPermissionLogicalId}",
                "Properties": {
                  "LogGroupName": "${LogGroupName}",
                  "FilterPattern": ${JSON.stringify(FilterPattern)},
                  "DestinationArn": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] }
                }
              }
            `;

            const commonSuffixOfLogGroupName = this.longestCommonSuffix(logGroupNamesThisFunction);

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
                  ".",
                  { "Ref": "AWS::URLSuffix" }
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

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newCloudWatchLogRuleObject, newPermissionObject);
          }
        });
      }
    });
  }

  longestCommonSuffix(logGroupNames) {
    const first = logGroupNames[0];
    const longestCommon = logGroupNames.reduce((last, current) => {
      for (let i = 0; i < last.length; i++) {
        if (last[i] !== current[i]) {
          return last.substring(0, i);
        }
      }
      return last;
    }, first);
    return longestCommon + ((longestCommon === first) ? '' : '*');
  }
}

module.exports = AwsCompileCloudWatchLogEvents;
