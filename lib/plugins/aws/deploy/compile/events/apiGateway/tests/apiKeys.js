'use strict';

const expect = require('chai').expect;

const AwsCompileApigEvents = require('../index');
const AwsProvider = require('../../../../../provider/awsProvider');
const Serverless = require('../../../../../../../Serverless');

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
    serverless.service.provider = {
      name: 'aws',
      apiKeys: ['1234567890'],
    };
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = awsCompileApigEvents.provider.naming
      .getLogicalApiGatewayName();
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
  });

  it('should compile api key resource', () =>
    awsCompileApigEvents.compileApiKeys().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.Type
      ).to.equal('AWS::ApiGateway::ApiKey');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.Properties.Enabled
      ).to.equal(true);

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.Properties.Name
      ).to.equal('1234567890');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.Properties.StageKeys[0].RestApiId.Ref
      ).to.equal(awsCompileApigEvents.provider.naming.getLogicalApiGatewayName());

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.Properties.StageKeys[0].StageName
      ).to.equal('dev');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayApiKey1.DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
    })
  );

  it('throw error if apiKey property is not an array', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = 2;
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(Error);
  });

  it('throw error if an apiKey is not a string', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = [2];
    expect(() => awsCompileApigEvents.compileApiKeys()).to.throw(Error);
  });
});
