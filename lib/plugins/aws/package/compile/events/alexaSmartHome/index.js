'use strict';

const _ = require('lodash');

class AwsCompileAlexaSmartHomeEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileAlexaSmartHomeEvents.bind(this),
    };
  }

  compileAlexaSmartHomeEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let alexaSmartHomeNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.alexaSmartHome) {
            alexaSmartHomeNumberInFunction++;
            let EventSourceToken;
            let Action;

            if (typeof event.alexaSmartHome === 'object') {
              if (!event.alexaSmartHome.appId) {
                const errorMessage = [
                  `Missing "appId" property for alexaSmartHome event in function ${functionName}`,
                  ' The correct syntax is: appId: amzn1.ask.skill.xxxx-xxxx',
                  ' OR an object with "appId" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              EventSourceToken = event.alexaSmartHome.appId;
              Action = event.alexaSmartHome.enabled !== false ?
                'lambda:InvokeFunction' : 'lambda:DisableInvokeFunction';
            } else if (typeof event.alexaSmartHome === 'string') {
              EventSourceToken = event.alexaSmartHome;
              Action = 'lambda:InvokeFunction';
            } else {
              const errorMessage = [
                `Alexa Smart Home event of function "${functionName}" is not an object or string.`,
                ' The correct syntax is: alexaSmartHome.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }
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
                Action: Action.replace(/\\n|\\r/g, ''),
                Principal: 'alexa-connectedhome.amazon.com',
                EventSourceToken: EventSourceToken.replace(/\\n|\\r/g, ''),
              },
            };

            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaAlexaSmartHomePermissionLogicalId(functionName,
                alexaSmartHomeNumberInFunction);

            const permissionCloudFormationResource = {
              [lambdaPermissionLogicalId]: permissionTemplate,
            };

            _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              permissionCloudFormationResource);
          }
        });
      }
    });
  }
}

module.exports = AwsCompileAlexaSmartHomeEvents;
