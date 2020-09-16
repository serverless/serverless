'use strict';

const _ = require('lodash');

class AwsCompileAlexaSmartHomeEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileAlexaSmartHomeEvents.bind(this),
    };

    const appIdSchema = {
      type: 'string',
      minLength: 0,
      maxLength: 256,
      pattern: '^[a-zA-Z0-9._\\-]+$',
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alexaSmartHome', {
      anyOf: [
        appIdSchema,
        {
          type: 'object',
          properties: {
            appId: appIdSchema,
            enabled: { type: 'boolean' },
          },
          required: ['appId'],
        },
      ],
    });
  }

  compileAlexaSmartHomeEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let alexaSmartHomeNumberInFunction = 0;

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.alexaSmartHome) {
            alexaSmartHomeNumberInFunction++;
            let EventSourceToken;
            let Action;

            if (typeof event.alexaSmartHome === 'object') {
              EventSourceToken = event.alexaSmartHome.appId;
              Action =
                event.alexaSmartHome.enabled !== false
                  ? 'lambda:InvokeFunction'
                  : 'lambda:DisableInvokeFunction';
            } else if (typeof event.alexaSmartHome === 'string') {
              EventSourceToken = event.alexaSmartHome;
              Action = 'lambda:InvokeFunction';
            }
            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

            const permissionTemplate = {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                },
                Action: Action.replace(/\\n|\\r/g, ''),
                Principal: 'alexa-connectedhome.amazon.com',
                EventSourceToken: EventSourceToken.replace(/\\n|\\r/g, ''),
              },
            };

            const lambdaPermissionLogicalId = this.provider.naming.getLambdaAlexaSmartHomePermissionLogicalId(
              functionName,
              alexaSmartHomeNumberInFunction
            );

            const permissionCloudFormationResource = {
              [lambdaPermissionLogicalId]: permissionTemplate,
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              permissionCloudFormationResource
            );
          }
        });
      }
    });
  }
}

module.exports = AwsCompileAlexaSmartHomeEvents;
