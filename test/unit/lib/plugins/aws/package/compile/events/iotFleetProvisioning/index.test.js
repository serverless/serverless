'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../utils/run-serverless');
const templateBody = require('../../../../../../../../fixtures/programmatic/iot-fleet-provisioning/template.json');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('lib/plugins/aws/package/compile/events/iotFleetProvisioning/index.test.js', () => {
  describe('nominal configurations', () => {
    const functionName = 'iotFleetProvisioningBasic';
    const disabledFunctionName = 'iotFleetProvisioningDisabled';
    const namedFunctionName = 'iotFleetProvisioningNamed';
    const stage = 'dev';
    let cfResources;
    let naming;
    let serviceName;

    before(async () => {
      const {
        awsNaming,
        cfTemplate,
        fixtureData: { serviceConfig },
      } = await runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            [functionName]: {
              handler: 'index.main',
              events: [
                {
                  iotFleetProvisioning: {
                    templateBody,
                    provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                  },
                },
              ],
            },
            [disabledFunctionName]: {
              handler: 'index.main',
              events: [
                {
                  iotFleetProvisioning: {
                    templateBody,
                    provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                    enabled: false,
                  },
                },
              ],
            },
            [namedFunctionName]: {
              handler: 'index.main',
              events: [
                {
                  iotFleetProvisioning: {
                    templateBody,
                    provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                    templateName: 'MyTemplate',
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      ({ Resources: cfResources } = cfTemplate);
      serviceName = serviceConfig.service;
      naming = awsNaming;
    });

    it('should create corresponding template resource', () => {
      const iotProvisioningTemplateResource =
        cfResources[naming.getIotFleetProvisioningLogicalId(functionName)];
      expect(iotProvisioningTemplateResource).to.deep.equal({
        Type: 'AWS::IoT::ProvisioningTemplate',
        Properties: {
          Enabled: true,
          PreProvisioningHook: {
            TargetArn: {
              'Fn::GetAtt': [naming.getLambdaLogicalId(functionName), 'Arn'],
            },
          },
          ProvisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
          TemplateBody: JSON.stringify(templateBody)
            .replace('${self:service}', serviceName)
            .replace("${opt:stage, self:provider.stage, 'dev'}", stage),
        },
        DependsOn: [naming.getLambdaIotFleetProvisioningPermissionLogicalId(functionName)],
      });
    });

    it('should create corresponding permission resource', () => {
      const lambdaPermissionResource =
        cfResources[naming.getLambdaIotFleetProvisioningPermissionLogicalId(functionName)];
      expect(lambdaPermissionResource).to.deep.equal({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': [naming.getLambdaLogicalId(functionName), 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'iot.amazonaws.com',
        },
      });
    });

    it('should allow disabling of a provisioning template', () => {
      const iotProvisioningTemplateResource =
        cfResources[naming.getIotFleetProvisioningLogicalId(disabledFunctionName)];
      expect(iotProvisioningTemplateResource.Properties.Enabled).to.eq(false);
    });

    it('should allow customization of a provisioning template TemplateName', () => {
      const iotProvisioningTemplateResource =
        cfResources[naming.getIotFleetProvisioningLogicalId(namedFunctionName)];
      expect(iotProvisioningTemplateResource.Properties.TemplateName).to.eq('MyTemplate');
    });
  });

  describe('disallowed configurations', () => {
    it('It should throw if there are more than one iotFleetProvisioning per lambda', () => {
      return expect(
        runServerless({
          fixture: 'function',
          configExt: {
            functions: {
              iotFleetProvisioningBasic: {
                handler: 'index.main',
                events: [
                  {
                    iotFleetProvisioning: {
                      templateBody,
                      provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                      templateName: 'MyTemplate1',
                    },
                  },
                  {
                    iotFleetProvisioning: {
                      templateBody,
                      provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                      templateName: 'MyTemplate2',
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'MULTIPLE_IOT_PROVISIONING_TEMPLATE_HOOK'
      );
    });
  });
});
