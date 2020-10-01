'use strict';

const _ = require('lodash');

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
        templateBody: { type: 'string' },
        templateName: { type: 'string' },
      },
      required: ['templateBody', 'provisioningRoleArn'],
      additionalProperties: false,
    });
  }

  compileIotFleetProvisioningEvents() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.iotFleetProvisioning) {
            const provisioningRoleArn = event.iotFleetProvisioning.provisioningRoleArn;
            const templateBody = event.iotFleetProvisioning.templateBody;

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const iotFleetProvisioningLogicalId = this.provider.naming.getIotFleetProvisioningLogicalId(
              functionName
            );
            const lambdaPermissionLogicalId = this.provider.naming.getLambdaIotFleetProvisioningPermissionLogicalId(
              functionName
            );

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
                TemplateBody: templateBody,
              },
            };

            if (event.iotFleetProvisioning.enabled === false) {
              provisioningTemplateResource.Properties.Enabled = false;
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
                SourceArn: {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':iot:',
                      { Ref: 'AWS::Region' },
                      ':',
                      { Ref: 'AWS::AccountId' },
                      ':provisioningtemplate/',
                      { Ref: iotFleetProvisioningLogicalId },
                    ],
                  ],
                },
              },
            };

            const newIotFleetProvisioningObject = {
              [iotFleetProvisioningLogicalId]: provisioningTemplateResource,
            };

            const newPermissionObject = {
              [lambdaPermissionLogicalId]: permissionResource,
            };

            _.merge(
              this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
              newIotFleetProvisioningObject,
              newPermissionObject
            );
          }
        });
      }
    });
  }
}
module.exports = AwsCompileIotFleetProvisioningEvents;
