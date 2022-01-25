'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');
const runServerless = require('../../../../../../../../../utils/run-serverless');

describe('#compileApiKeys()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: [], options: {} });
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
      },
      {
        name: '2345678901',
        value: undefined,
        description: undefined,
        customerId: undefined,
      },
      {
        name: undefined,
        value: 'valueForKeyWithoutName',
        description: 'Api key description',
        customerId: undefined,
      },
      {
        name: '3456789012',
        value: 'valueForKey3456789012',
        description: undefined,
        customerId: undefined,
      },
      {
        name: '9876543211',
        value: 'valueForKey9876543211',
        description: undefined,
        customerId: 'customerid98765',
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
      ).to.equal(true);

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
});

describe('lib/plugins/aws/package/compile/events/apiGateway/lib/apiKeys.test.js', () => {
  let cfResources;
  let naming;
  let serverlessInstance;
  const apiGatewayExt = {
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
          { description: 'descriptionForKeyWithoutNameOrValue' },
        ],
      },
      { paid: ['0987654321', 'jihgfedcba'] },
      {
        disabled: [{ name: '1111111111', enabled: false }],
      },
    ],
    usagePlan: [{ free: {} }, { paid: {} }, { disabled: {} }],
  };

  before(async () => {
    const { awsNaming, cfTemplate, serverless } = await runServerless({
      fixture: 'api-gateway',
      command: 'package',
      configExt: {
        provider: {
          apiGateway: apiGatewayExt,
        },
      },
    });
    naming = awsNaming;
    cfResources = cfTemplate.Resources;
    serverlessInstance = serverless;
  });

  it('should disable keys when enabled: false', () => {
    const resource = cfResources[naming.getApiKeyLogicalId(1, 'disabled')];
    expect(resource.Properties.Enabled).to.be.false;
  });

  it('should support usage plan notation', () => {
    const expectedApiKeys = {
      free: [
        { name: '1234567890', value: undefined, description: undefined },
        { name: '2345678901', value: undefined, description: undefined },
        {
          name: undefined,
          value: 'valueForKeyWithoutName',
          description: 'Api key description',
        },
        {
          name: '3456789012',
          value: 'valueForKey3456789012',
          description: undefined,
        },
        {
          name: undefined,
          value: undefined,
          description: 'descriptionForKeyWithoutNameOrValue',
        },
      ],
      paid: [
        { name: '0987654321', value: undefined, description: undefined },
        { name: 'jihgfedcba', value: undefined, description: undefined },
      ],
    };

    apiGatewayExt.apiKeys.slice(0, 2).forEach((plan) => {
      const planName = Object.keys(plan)[0]; // free || paid
      const apiKeys = expectedApiKeys[planName];
      apiKeys.forEach((apiKey, index) => {
        const resource = cfResources[naming.getApiKeyLogicalId(index + 1, planName)];
        expect(resource.Type).to.equal('AWS::ApiGateway::ApiKey');
        expect(resource.Properties.Enabled).to.equal(true);
        expect(resource.Properties.Name).to.equal(apiKey.name);
        expect(resource.Properties.Description).to.equal(apiKey.description);
        expect(resource.Properties.Value).to.equal(apiKey.value);
        expect(resource.Properties.StageKeys[0].RestApiId.Ref).to.equal('ApiGatewayRestApi');
        expect(resource.Properties.StageKeys[0].StageName).to.equal('dev');
        expect(resource.DependsOn).to.equal(
          naming.generateApiGatewayDeploymentLogicalId(serverlessInstance.instanceId)
        );
      });
    });
  });
});
