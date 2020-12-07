'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../../utils/run-serverless');
const templateBody = require('../../../../../../../../fixtures/iotFleetProvisioning/template.json');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('lib/plugins/aws/package/compile/events/iotFleetProvisioning/index.test.js', () => {
  const functionName = 'iotFleetProvisioningBasic';
  let cfResources;
  let naming;

  before(async () => {
    const { awsNaming, cfTemplate } = await runServerless({
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
                },
              },
            ],
          },
        },
      },
      cliArgs: ['package'],
    });
    ({ Resources: cfResources } = cfTemplate);
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
        TemplateBody: JSON.stringify(templateBody),
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

  describe('With enabled parameter', () => {
    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
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
                    enabled: false,
                  },
                },
              ],
            },
          },
        },
        cliArgs: ['package'],
      });
      ({ Resources: cfResources } = cfTemplate);
      naming = awsNaming;
    });

    it('should allow disabling of a provisioning template', () => {
      const iotProvisioningTemplateResource =
        cfResources[naming.getIotFleetProvisioningLogicalId(functionName)];
      expect(iotProvisioningTemplateResource.Properties.Enabled).to.eq(false);
    });
  });

  describe('With templateName parameter', () => {
    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
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
                    templateName: 'MyTemplate',
                  },
                },
              ],
            },
          },
        },
        cliArgs: ['package'],
      })(({ Resources: cfResources } = cfTemplate));
      naming = awsNaming;
    });

    it('should allow customization of a provisioning template TemplateName', () => {
      const iotProvisioningTemplateResource =
        cfResources[naming.getIotFleetProvisioningLogicalId(functionName)];
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
          cliArgs: ['package'],
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'MULTIPLE_IOT_PROVISIONING_TEMPLATE_HOOK'
      );
    });
  });
});
