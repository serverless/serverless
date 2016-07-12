'use strict';

const _ = require('lodash');

class AwsCompileAlexaSkillsKitEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileAlexaSkillsKitEvents.bind(this),
    };
  }

  compileAlexaSkillsKitEvents() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes
        .Error('This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        for (let i = 0; i < functionObj.events.length; i++) {
          const event = functionObj.events[i];
          if (event === 'ask') {
            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "alexa-appkit.amazon.com"
                }
              }
            `;

            const newPermissionObject = {
              [`${functionName}AlexaSkillsKitEventPermission${i}`]: JSON.parse(permissionTemplate),
            };

            _.merge(this.serverless.service.resources.Resources,
              newPermissionObject);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileAlexaSkillsKitEvents;
