'use strict';

const ServerlessError = require('../../../../../serverless-error');
const _ = require('lodash');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

class AwsCompileIotFleetProvisioningEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': async () => this.compileIotFleetProvisioningEvents(),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'iotFleetProvisioning', {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        provisioningRoleArn: { $ref: '#/definitions/awsArn' },
        templateBody: { type: 'object' },
        templateName: { type: 'string' },
      },
      required: ['templateBody', 'provisioningRoleArn'],
      additionalProperties: false,
    });
  }

  compileIotFleetProvisioningEvents() {
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events.filter((event) => event.iotFleetProvisioning).length > 1) {
        throw new ServerlessError(
          `Found more than one iotFleetProvision event for function ${functionName}`,
          'MULTIPLE_IOT_PROVISIONING_TEMPLATE_HOOK'
        );
      }

      functionObj.events.forEach((event) => {
        if (!event.iotFleetProvisioning) return;

        const provisioningRoleArn = event.iotFleetProvisioning.provisioningRoleArn;
        const templateBody = event.iotFleetProvisioning.templateBody;

        const iotFleetProvisioningLogicalId =
          this.provider.naming.getIotFleetProvisioningLogicalId(functionName);
        const lambdaPermissionLogicalId =
          this.provider.naming.getLambdaIotFleetProvisioningPermissionLogicalId(functionName);

        const provisioningTemplateResource = {
          Type: 'AWS::IoT::ProvisioningTemplate',
          Properties: {
            Enabled: true,
            PreProvisioningHook: {
              TargetArn: resolveLambdaTarget(functionName, functionObj),
            },
            ProvisioningRoleArn: provisioningRoleArn,
            TemplateBody: JSON.stringify(templateBody),
          },
          DependsOn: [
            lambdaPermissionLogicalId,
            _.get(functionObj.targetAlias, 'logicalId'),
          ].filter(Boolean),
        };

        if (event.iotFleetProvisioning.enabled !== undefined) {
          provisioningTemplateResource.Properties.Enabled = event.iotFleetProvisioning.enabled;
        }

        if (event.iotFleetProvisioning.templateName) {
          provisioningTemplateResource.Properties.TemplateName =
            event.iotFleetProvisioning.templateName;
        }

        const permissionResource = {
          Type: 'AWS::Lambda::Permission',
          DependsOn: _.get(functionObj.targetAlias, 'logicalId'),
          Properties: {
            FunctionName: resolveLambdaTarget(functionName, functionObj),
            Action: 'lambda:InvokeFunction',
            Principal: 'iot.amazonaws.com',
          },
        };

        const newIotFleetProvisioningObject = {
          [iotFleetProvisioningLogicalId]: provisioningTemplateResource,
        };

        const newPermissionObject = {
          [lambdaPermissionLogicalId]: permissionResource,
        };

        Object.assign(
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          newIotFleetProvisioningObject,
          newPermissionObject
        );
      });
    });
  }
}
module.exports = AwsCompileIotFleetProvisioningEvents;
