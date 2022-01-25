'use strict';

const ServerlessError = require('../../../../../serverless-error');

class AwsCompileIotFleetProvisioningEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileIotFleetProvisioningEvents.bind(this),
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

        const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
        const iotFleetProvisioningLogicalId =
          this.provider.naming.getIotFleetProvisioningLogicalId(functionName);
        const lambdaPermissionLogicalId =
          this.provider.naming.getLambdaIotFleetProvisioningPermissionLogicalId(functionName);

        const provisioningTemplateResource = {
          Type: 'AWS::IoT::ProvisioningTemplate',
          Properties: {
            Enabled: true,
            PreProvisioningHook: {
              TargetArn: {
                'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
              },
            },
            ProvisioningRoleArn: provisioningRoleArn,
            TemplateBody: JSON.stringify(templateBody),
          },
          DependsOn: [lambdaPermissionLogicalId],
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
          Properties: {
            FunctionName: {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            },
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
