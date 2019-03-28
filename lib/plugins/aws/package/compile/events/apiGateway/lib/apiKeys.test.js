'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

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

  it('should support string notations', () => {
    awsCompileApigEvents.serverless.service.provider.apiKeys = ['1234567890', 'abcdefghij'];

    return awsCompileApigEvents.compileApiKeys().then(() => {
      // key 1
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].Type
      ).to.equal('AWS::ApiGateway::ApiKey');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].Properties.Enabled
      ).to.equal(true);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].Properties.Name
      ).to.equal('1234567890');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].Properties.StageKeys[0].RestApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].Properties.StageKeys[0].StageName
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1)
          ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');

      // key2
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].Type
      ).to.equal('AWS::ApiGateway::ApiKey');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].Properties.Enabled
      ).to.equal(true);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].Properties.Name
      ).to.equal('abcdefghij');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].Properties.StageKeys[0].RestApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].Properties.StageKeys[0].StageName
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2)
          ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
    });
  });

  describe('when using object notation', () => {
    it('should support object notations', () => {
      awsCompileApigEvents.serverless.service.provider.apiKeys = [
        { free: ['1234567890', 'abcdefghij'] },
        { paid: ['0987654321', 'jihgfedcba'] },
      ];

      return awsCompileApigEvents.compileApiKeys().then(() => {
        // "free" plan resources
        // "free" key 1
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].Type
        ).to.equal('AWS::ApiGateway::ApiKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].Properties.Name
        ).to.equal('1234567890');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].Properties.StageKeys[0].RestApiId.Ref
        ).to.equal('ApiGatewayRestApi');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].Properties.StageKeys[0].StageName
        ).to.equal('dev');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'free')
            ].DependsOn
        ).to.equal('ApiGatewayDeploymentTest');
        // "free" key 2
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].Type
        ).to.equal('AWS::ApiGateway::ApiKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].Properties.Name
        ).to.equal('abcdefghij');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].Properties.StageKeys[0].RestApiId.Ref
        ).to.equal('ApiGatewayRestApi');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].Properties.StageKeys[0].StageName
        ).to.equal('dev');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'free')
            ].DependsOn
        ).to.equal('ApiGatewayDeploymentTest');

        // "paid" plan resources
        // "paid" key 1
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].Type
        ).to.equal('AWS::ApiGateway::ApiKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].Properties.Name
        ).to.equal('0987654321');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].Properties.StageKeys[0].RestApiId.Ref
        ).to.equal('ApiGatewayRestApi');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].Properties.StageKeys[0].StageName
        ).to.equal('dev');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(1, 'paid')
            ].DependsOn
        ).to.equal('ApiGatewayDeploymentTest');
        // "paid" key 2
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].Type
        ).to.equal('AWS::ApiGateway::ApiKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].Properties.Enabled
        ).to.equal(true);
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].Properties.Name
        ).to.equal('jihgfedcba');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].Properties.StageKeys[0].RestApiId.Ref
        ).to.equal('ApiGatewayRestApi');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].Properties.StageKeys[0].StageName
        ).to.equal('dev');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
              awsCompileApigEvents.provider.naming.getApiKeyLogicalId(2, 'paid')
            ].DependsOn
        ).to.equal('ApiGatewayDeploymentTest');
      });
    });
  });
});
