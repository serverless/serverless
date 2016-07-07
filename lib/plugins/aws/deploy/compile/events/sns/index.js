'use strict';

const _ = require('lodash');

class AwsCompileSNSEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileSNSEvents.bind(this),
    };
  }

  compileSNSEvents() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes
        .Error('This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        for (let i = 0; i < functionObj.events.length; i++) {
          const event = functionObj.events[i];
          if (event.sns) {
            let topicName;
            let displayName = '';

            if (typeof event.sns === 'object') {
              if (!event.sns.topic_name || !event.sns.display_name) {
                const errorMessage = [
                  `Missing "topic_name" property for sns event in function ${functionName}`,
                  ' The correct syntax is: sns: topic-name',
                  ' OR an object with "topic_name" AND "display_name" properties.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              topicName = event.sns.topic_name;
              displayName = event.sns.display_name;
            } else if (typeof event.sns === 'string') {
              topicName = event.sns;
            } else {
              const errorMessage = [
                `SNS event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: sns: topic-name',
                ' OR an object with "topic_name" AND "display_name" properties.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const snsTemplate = `
              {
                "Type": "AWS::SNS::Topic",
                "Properties": {
                  "TopicName": "${topicName}",
                  "DisplayName": "${displayName}",
                  "Subscription": [
                    {
                      "Endpoint": { "Fn::GetAtt": ["${functionName}", "Arn"] },
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
                  "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "sns.amazonaws.com",
                  "SourceArn": { "Ref": "${functionName}SNSEvent${i}" }
                }
              }
            `;

            const newSNSObject = {
              [`${functionName}SNSEvent${i}`]: JSON.parse(snsTemplate),
            };

            const newPermissionObject = {
              [`${functionName}SNSEventPermission${i}`]: JSON.parse(permissionTemplate),
            };

            _.merge(this.serverless.service.resources.Resources,
              newSNSObject, newPermissionObject);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
