'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/apiGateway/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileApiKeys()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.service = 'first-service';
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
  });

  it('should support api key notation', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      apiKeys: [
        '1234567890',
        { name: '2345678901' },
        { value: 'valueForKeyWithoutName', description: 'Api key description' },
        { name: '3456789012', value: 'valueForKey3456789012' },
        {
          name: '9876543211',
          value: 'valueForKey9876543211',
          customerId: 'customerid98765',
        },
        {
          name: '4567890123',
          enabled: false,
        },
        {
          name: '5678901234',
          enabled: true,
        },
      ],
      // Added purely to test https://github.com/serverless/serverless/issues/7844 regression
      usagePlan: {
        quota: { limit: 5000 },
      },
    };

    awsCompileApigEvents.compileApiKeys();
    const expectedApiKeys = [
      {
        name: '1234567890',
        value: undefined,
        description: undefined,
        customerId: undefined,
        enabled: true,
      },
      {
        name: '2345678901',
        value: undefined,
        description: undefined,
        customerId: undefined,
        enabled: true,
      },
      {
        name: undefined,
        value: 'valueForKeyWithoutName',
        description: 'Api key description',
        customerId: undefined,
        enabled: true,
      },
      {
        name: '3456789012',
        value: 'valueForKey3456789012',
        description: undefined,
        customerId: undefined,
        enabled: true,
      },
      {
        name: '9876543211',
        value: 'valueForKey9876543211',
        description: undefined,
        customerId: 'customerid98765',
        enabled: true,
      },
      {
        name: '4567890123',
        value: undefined,
        description: undefined,
        customerId: undefined,
        enabled: false,
      },
      {
        name: '5678901234',
        value: undefined,
        description: undefined,
        customerId: undefined,
        enabled: true,
      },
    ];

    expectedApiKeys.forEach((apiKey, index) => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Type
      ).to.equal('AWS::ApiGateway::ApiKey');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.Enabled
      ).to.equal(apiKey.enabled);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.Name
      ).to.equal(apiKey.name);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.Description
      ).to.equal(apiKey.description);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.CustomerId
      ).to.equal(apiKey.customerId);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.Value
      ).to.equal(apiKey.value);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.StageKeys[0].RestApiId.Ref
      ).to.equal('ApiGatewayRestApi');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].Properties.StageKeys[0].StageName
      ).to.equal('dev');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1)
        ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
    });
  });

  describe('when using usage plan notation', () => {
    it('should support usage plan notation', () => {
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        apiKeys: [
          {
            free: [
              '1234567890',
              { name: '2345678901' },
              {
                value: 'valueForKeyWithoutName',
                description: 'Api key description',
              },
              { name: '3456789012', value: 'valueForKey3456789012' },
              { name: '4567890123', enabled: false },
            ],
          },
          {
            paid: ['0987654321', 'jihgfedcba', { name: '5678901234', enabled: true }],
          },
        ],
        usagePlan: [{ free: [] }, { paid: [] }],
      };

      awsCompileApigEvents.compileApiKeys();
      const expectedApiKeys = {
        free: [
          { name: '1234567890', value: undefined, description: undefined, enabled: true },
          { name: '2345678901', value: undefined, description: undefined, enabled: true },
          {
            name: undefined,
            value: 'valueForKeyWithoutName',
            description: 'Api key description',
            enabled: true,
          },
          {
            name: '3456789012',
            value: 'valueForKey3456789012',
            description: undefined,
            enabled: true,
          },
          {
            name: '4567890123',
            value: undefined,
            description: undefined,
            enabled: false,
          },
        ],
        paid: [
          { name: '0987654321', value: undefined, description: undefined, enabled: true },
          { name: 'jihgfedcba', value: undefined, description: undefined, enabled: true },
          { name: '5678901234', value: undefined, description: undefined, enabled: true },
        ],
      };
      awsCompileApigEvents.serverless.service.provider.apiGateway.apiKeys.forEach((plan) => {
        const planName = Object.keys(plan)[0]; // free || paid
        const apiKeys = expectedApiKeys[planName];
        apiKeys.forEach((apiKey, index) => {
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Type
          ).to.equal('AWS::ApiGateway::ApiKey');
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.Enabled
          ).to.equal(apiKey.enabled);
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.Name
          ).to.equal(apiKey.name);
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.Description
          ).to.equal(apiKey.description);
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.Value
          ).to.equal(apiKey.value);
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.StageKeys[0].RestApiId.Ref
          ).to.equal('ApiGatewayRestApi');
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].Properties.StageKeys[0].StageName
          ).to.equal('dev');
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(index + 1, planName)
            ].DependsOn
          ).to.equal('ApiGatewayDeploymentTest');
        });
      });
    });
  });
});
