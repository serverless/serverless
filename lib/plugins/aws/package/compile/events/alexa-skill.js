'use strict';

const _ = require('lodash');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

class AwsCompileAlexaSkillEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'alexaSkill', {
      anyOf: [
        { $ref: '#/definitions/awsAlexaEventToken' },
        {
          type: 'object',
          properties: {
            appId: { $ref: '#/definitions/awsAlexaEventToken' },
            enabled: { type: 'boolean' },
          },
          required: ['appId'],
          additionalProperties: false,
        },
      ],
    });

    this.hooks = {
      'initialize': () => {
        if (
          this.serverless.service.provider.name === 'aws' &&
          Object.values(this.serverless.service.functions).some(({ events }) =>
            events.some((event) => event === 'alexaSkill')
          )
        ) {
          this.serverless._logDeprecation(
            'ALEXA_SKILL_EVENT_WITHOUT_APP_ID',
            'Starting with next major version, support for alexaSkill event without appId specified will be removed.'
          );
        }
      },
      'package:compileEvents': async () => this.compileAlexaSkillEvents(),
    };
  }

  compileAlexaSkillEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      let alexaSkillNumberInFunction = 0;

      functionObj.events.forEach((event) => {
        if (event.alexaSkill) {
          let enabled = true;
          let appId;
          if (typeof event.alexaSkill === 'string') {
            appId = event.alexaSkill;
          } else {
            appId = event.alexaSkill.appId;
            // Parameter `enabled` is optional, hence the explicit non-equal check for false.
            enabled = event.alexaSkill.enabled !== false;
          }
          alexaSkillNumberInFunction++;

          const permissionTemplate = {
            Type: 'AWS::Lambda::Permission',
            DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
            Properties: {
              FunctionName: resolveLambdaTarget(functionName, functionObj),
              Action: enabled ? 'lambda:InvokeFunction' : 'lambda:DisableInvokeFunction',
              Principal: 'alexa-appkit.amazon.com',
            },
          };

          if (appId) {
            permissionTemplate.Properties.EventSourceToken = appId.replace(/\\n|\\r/g, '');
          }

          const lambdaPermissionLogicalId =
            this.provider.naming.getLambdaAlexaSkillPermissionLogicalId(
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
    });
  }
}

module.exports = AwsCompileAlexaSkillEvents;
