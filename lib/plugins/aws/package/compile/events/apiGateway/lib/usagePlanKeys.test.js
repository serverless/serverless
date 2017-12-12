'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileUsagePlanKeys()', () => {
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
    serverless.service.provider = {
      name: 'aws',
      apiKeys: ['1234567890'],
    };
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
    awsCompileApigEvents.apiGatewayUsagePlanLogicalId = 'UsagePlan';
  });

  it('should compile usage plan key resource', () =>
    awsCompileApigEvents.compileUsagePlanKeys().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
          ].Type
      ).to.equal('AWS::ApiGateway::UsagePlanKey');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
          ].Properties.KeyId.Ref
      ).to.equal('ApiGatewayApiKey1');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
          ].Properties.KeyType
      ).to.equal('API_KEY');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
          ].Properties.UsagePlanId.Ref
      ).to.equal('UsagePlan');
    })
  );

  it('throw error if apiKey property is not an array', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = 2;
    expect(() => awsCompileApigEvents.compileUsagePlanKeys()).to.throw(Error);
  });

  it('throw error if an apiKey is not a string', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = [2];
    expect(() => awsCompileApigEvents.compileUsagePlanKeys()).to.throw(Error);
  });
});
