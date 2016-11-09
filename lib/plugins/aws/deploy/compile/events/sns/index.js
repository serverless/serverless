'use strict';

const _ = require('lodash');

class AwsCompileSNSEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileSNSEvents.bind(this),
    };
  }

  compileSNSEvents() {
    const topicsCreated = [];
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.sns) {
            let topicName;
            let displayName = '';

            if (typeof event.sns === 'object') {
              if (!event.sns.topicName || !event.sns.displayName) {
                const errorMessage = [
                  `Missing "topicName" property for sns event in function ${functionName}`,
                  ' The correct syntax is: sns: topic-name',
                  ' OR an object with "topicName" AND "displayName" properties.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              } else {
                topicName = event.sns.topicName;
                displayName = event.sns.displayName;
              }
            } else if (typeof event.sns === 'string') {
              topicName = event.sns;
            } else {
              const errorMessage = [
                `SNS event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: sns: topic-name',
                ' OR an object with "topicName" AND "displayName" properties.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming
              .getLogicalLambdaName(functionName);
            const topicLogicalId = this.provider.naming
              .getLogicalSnsTopicName(topicName);
            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaSnsTopicPermissionName(functionName, topicName);

            const snsTemplate = `
              {
                "Type": "AWS::SNS::Topic",
                "Properties": {
                  "TopicName": "${topicName}",
                  "DisplayName": "${displayName}",
                  "Subscription": [
                    {
                      "Endpoint": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                      "Protocol": "lambda"
                    }
                  ]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${lambdaLogicalId}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "sns.amazonaws.com"
                }
              }
            `;

            const newSNSObject = {
              [topicLogicalId]: JSON.parse(snsTemplate),
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: JSON.parse(permissionTemplate),
            };

            // create new topic only if not created before
            if (topicsCreated.indexOf(topicName) === -1) {
              _.merge(this.serverless.service.provider
                  .compiledCloudFormationTemplate.Resources,
                newSNSObject);
              topicsCreated.push(topicName);
            } else {
              const newSubscription = {
                Protocol: 'lambda',
                Endpoint: {
                  'Fn::GetAtt': [
                    lambdaLogicalId,
                    'Arn',
                  ],
                },
              };
              this.serverless.service.provider.compiledCloudFormationTemplate
                .Resources[topicLogicalId]
                .Properties.Subscription.push(newSubscription);
            }

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newPermissionObject);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
