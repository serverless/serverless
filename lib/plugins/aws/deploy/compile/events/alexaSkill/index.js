'use strict';

const _ = require('lodash');

class AwsCompileAlexaSkillEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileAlexaSkillEvents.bind(this),
    };
  }

  compileAlexaSkillEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event === 'alexaSkill') {
            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);

            const permissionTemplate = {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': [
                    lambdaLogicalId,
                    'Arn',
                  ],
                },
                Action: 'lambda:InvokeFunction',
                Principal: 'alexa-appkit.amazon.com',
              },
            };

            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaAlexaSkillPermissionLogicalId(functionName);

            const permissionCloudForamtionResource = {
              [lambdaPermissionLogicalId]: permissionTemplate,
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              permissionCloudForamtionResource);
          } else if (event.alexaSkill) {
            const errorMessage = [
              `Alexa Skill event of function "${functionName}" is not an object or string.`,
              ' The correct syntax is: alexaSkill.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes.Error(errorMessage);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileAlexaSkillEvents;
