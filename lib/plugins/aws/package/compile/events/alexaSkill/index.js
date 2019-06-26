'use strict';

const _ = require('lodash');

class AwsCompileAlexaSkillEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileAlexaSkillEvents.bind(this),
    };
  }

  compileAlexaSkillEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let alexaSkillNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event === 'alexaSkill' || event.alexaSkill) {
            let enabled = true;
            let appId;
            if (event === 'alexaSkill') {
              const warningMessage = [
                "Warning! You are using an old syntax for alexaSkill which doesn't",
                ' restrict the invocation solely to your skill.',
                ' Please refer to the documentation for additional information.',
              ].join('');
              this.serverless.cli.log(warningMessage);
            } else if (_.isString(event.alexaSkill)) {
              appId = event.alexaSkill;
            } else if (_.isPlainObject(event.alexaSkill)) {
              if (!_.isString(event.alexaSkill.appId)) {
                const errorMessage = [
                  `Missing "appId" property for alexaSkill event in function ${functionName}`,
                  ' The correct syntax is: appId: amzn1.ask.skill.xx-xx-xx-xx-xx',
                  ' OR an object with "appId" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes.Error(errorMessage);
              }
              appId = event.alexaSkill.appId;
              // Parameter `enabled` is optional, hence the explicit non-equal check for false.
              enabled = event.alexaSkill.enabled !== false;
            } else {
              const errorMessage = [
                `Alexa Skill event of function "${functionName}" is not an object or string.`,
                ' The correct syntax is: alexaSkill.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }
            alexaSkillNumberInFunction++;

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

            const permissionTemplate = {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
                Action: enabled ? 'lambda:InvokeFunction' : 'lambda:DisableInvokeFunction',
                Principal: 'alexa-appkit.amazon.com',
              },
            };

            if (appId) {
              permissionTemplate.Properties.EventSourceToken = appId.replace(/\\n|\\r/g, '');
            }

            const lambdaPermissionLogicalId = this.provider.naming.getLambdaAlexaSkillPermissionLogicalId(
              functionName,
              alexaSkillNumberInFunction
            );

            const permissionCloudForamtionResource = {
              [lambdaPermissionLogicalId]: permissionTemplate,
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              permissionCloudForamtionResource
            );
          }
        });
      }
    });
  }
}

module.exports = AwsCompileAlexaSkillEvents;
