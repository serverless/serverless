'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileIotFleetProvisioningEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileIoTEvents', () => {
  let serverless;
  let awsCompileIoTFleetProvisioningEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileIoTFleetProvisioningEvents = new AwsCompileIotFleetProvisioningEvents(serverless);
    awsCompileIoTFleetProvisioningEvents.serverless.service.service = 'new-service';
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileIoTFleetProvisioningEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#awsCompileIoTFleetProvisioningEvents()', () => {
    it('should create corresponding resources when iot fleet provisioning events are given', () => {
      awsCompileIoTFleetProvisioningEvents.serverless.service.functions = {
        smartBulb: {
          events: [
            {
              iotFleetProvisioning: {
                templateBody: { Key: 'Value' },
                provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
              },
            },
          ],
        },
      };

      awsCompileIoTFleetProvisioningEvents.compileIotFleetProvisioningEvents();

      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartBulbIotProvisioningTemplate1
      ).to.deep.equal({
        Type: 'AWS::IoT::ProvisioningTemplate',
        Properties: {
          Enabled: true,
          PreProvisioningHook: {
            TargetArn: {
              'Fn::GetAtt': ['SmartBulbLambdaFunction', 'Arn'],
            },
          },
          ProvisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
          TemplateBody: '{"Key":"Value"}',
        },
        DependsOn: ['SmartBulbLambdaPermissionIotProvisioningTemplate'],
      });
      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartBulbLambdaPermissionIotProvisioningTemplate
      ).to.deep.equal({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['SmartBulbLambdaFunction', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'iot.amazonaws.com',
        },
      });
    });

    it('should allow disabling of provisioning template', () => {
      awsCompileIoTFleetProvisioningEvents.serverless.service.functions = {
        smartBulb: {
          events: [
            {
              iotFleetProvisioning: {
                templateBody: { Key: 'Value' },
                provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
                enabled: false,
              },
            },
          ],
        },
      };

      awsCompileIoTFleetProvisioningEvents.compileIotFleetProvisioningEvents();

      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartBulbIotProvisioningTemplate1.Properties
          .Enabled
      ).to.equal(false);
    });

    it('should allow providing a custom template name', () => {
      awsCompileIoTFleetProvisioningEvents.serverless.service.functions = {
        smartBulb: {
          events: [
            {
              iotFleetProvisioning: {
                templateName: 'MyTemplateName',
                templateBody: { Key: 'Value' },
                provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
              },
            },
          ],
        },
      };

      awsCompileIoTFleetProvisioningEvents.compileIotFleetProvisioningEvents();

      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartBulbIotProvisioningTemplate1.Properties
          .TemplateName
      ).to.equal('MyTemplateName');
    });

    it('should allow specifying multiple template for the same pre-validation lambda hook', () => {
      awsCompileIoTFleetProvisioningEvents.serverless.service.functions = {
        smartHomeValidation: {
          events: [
            {
              iotFleetProvisioning: {
                templateName: 'SmartBulb',
                templateBody: { Key: 'Value' },
                provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
              },
            },
            {
              iotFleetProvisioning: {
                templateName: 'SmartBlinds',
                templateBody: { Key: 'Value2' },
                provisioningRoleArn: 'arn:aws:iam::123456789:role/provisioning-role',
              },
            },
          ],
        },
      };

      awsCompileIoTFleetProvisioningEvents.compileIotFleetProvisioningEvents();

      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      ).to.have.property('SmartHomeValidationIotProvisioningTemplate1');
      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartHomeValidationIotProvisioningTemplate1
          .Properties.TemplateName
      ).to.equal('SmartBulb');
      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      ).to.have.property('SmartHomeValidationIotProvisioningTemplate2');
      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources.SmartHomeValidationIotProvisioningTemplate2
          .Properties.TemplateName
      ).to.equal('SmartBlinds');
      expect(
        awsCompileIoTFleetProvisioningEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources
      ).to.have.property('SmartHomeValidationLambdaPermissionIotProvisioningTemplate');
    });
  });
});
