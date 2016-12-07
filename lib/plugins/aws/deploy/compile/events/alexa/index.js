'use strict';

const _ = require('lodash');

class AwsCompileAlexaEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'deploy:compileEvents': this.compileAlexaEvents.bind(this),
    };
  }

  compileAlexaEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.alexa) {
            if (typeof event.alexa === 'boolean' && event.alexa) {
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
                .getLambdaAlexaPermissionLogicalId(functionName);

              const permissionCloudForamtionResource = {
                [lambdaPermissionLogicalId]: permissionTemplate,
              };

              _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
                permissionCloudForamtionResource);
            } else {
              const errorMessage = [
                `Alexa event of function "${functionName}" is not a boolean.`,
                ' The correct syntax is: alexa: true.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }
          }
        });
      }
    });
  }
}

module.exports = AwsCompileAlexaEvents;
