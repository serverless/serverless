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
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
  });

  it('should support string notations', () => {
    const defaultUsagePlanLogicalId = awsCompileApigEvents
      .provider.naming.getUsagePlanLogicalId();
    awsCompileApigEvents.apiGatewayUsagePlanNames = ['default'];
    awsCompileApigEvents.serverless.service.provider.apiKeys = ['1234567890', 'abcdefghij'];

    return awsCompileApigEvents.compileUsagePlanKeys().then(() => {
      // key 1
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
      ).to.equal(defaultUsagePlanLogicalId);

      // key 2
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
          ].Type
      ).to.equal('AWS::ApiGateway::UsagePlanKey');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
          ].Properties.KeyId.Ref
      ).to.equal('ApiGatewayApiKey2');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
          ].Properties.KeyType
      ).to.equal('API_KEY');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
          ].Properties.UsagePlanId.Ref
      ).to.equal(defaultUsagePlanLogicalId);
    });
  });

  describe('when using object notation', () => {
    it('should support object notations', () => {
      const freeUsagePlanName = 'free';
      const paidUsagePlanName = 'paid';
      const freeUsagePlanLogicalId = awsCompileApigEvents
        .provider.naming.getUsagePlanLogicalId(freeUsagePlanName);
      const paidUsagePlanLogicalId = awsCompileApigEvents
        .provider.naming.getUsagePlanLogicalId(paidUsagePlanName);
      awsCompileApigEvents.apiGatewayUsagePlanNames = [freeUsagePlanName, paidUsagePlanName];
      awsCompileApigEvents.serverless.service.provider.apiKeys = [
        { free: ['1234567890', 'abcdefghij'] },
        { paid: ['0987654321', 'jihgfedcba'] },
      ];

      return awsCompileApigEvents.compileUsagePlanKeys().then(() => {
        // "free" plan resources
        // "free" key 1
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'free')
            ].Type
        ).to.equal('AWS::ApiGateway::UsagePlanKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'free')
            ].Properties.KeyId.Ref
        ).to.equal('ApiGatewayApiKeyFree1');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'free')
            ].Properties.KeyType
        ).to.equal('API_KEY');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'free')
            ].Properties.UsagePlanId.Ref
        ).to.equal(freeUsagePlanLogicalId);
        // "free" key 2
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'free')
            ].Type
        ).to.equal('AWS::ApiGateway::UsagePlanKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'free')
            ].Properties.KeyId.Ref
        ).to.equal('ApiGatewayApiKeyFree2');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'free')
            ].Properties.KeyType
        ).to.equal('API_KEY');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'free')
            ].Properties.UsagePlanId.Ref
        ).to.equal(freeUsagePlanLogicalId);

        // "paid" plan resources
        // "paid" key 1
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'paid')
            ].Type
        ).to.equal('AWS::ApiGateway::UsagePlanKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'paid')
            ].Properties.KeyId.Ref
        ).to.equal('ApiGatewayApiKeyPaid1');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'paid')
            ].Properties.KeyType
        ).to.equal('API_KEY');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1, 'paid')
            ].Properties.UsagePlanId.Ref
        ).to.equal(paidUsagePlanLogicalId);
        // "paid" key 2
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'paid')
            ].Type
        ).to.equal('AWS::ApiGateway::UsagePlanKey');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'paid')
            ].Properties.KeyId.Ref
        ).to.equal('ApiGatewayApiKeyPaid2');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'paid')
            ].Properties.KeyType
        ).to.equal('API_KEY');
        expect(
          awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[
            awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2, 'paid')
            ].Properties.UsagePlanId.Ref
        ).to.equal(paidUsagePlanLogicalId);
      });
    });

    it('should throw if api key name does not match a usage plan', () => {
      awsCompileApigEvents.apiGatewayUsagePlanNames = ['default'];
      awsCompileApigEvents.serverless.service.provider.apiKeys = [
        { free: ['1234567890'] },
      ];
      expect(() => awsCompileApigEvents.compileUsagePlanKeys())
        .to.throw(/has no usage plan defined/);
    });

    it('should throw if api key definitions are not strings', () => {
      awsCompileApigEvents.apiGatewayUsagePlanNames = ['free'];
      awsCompileApigEvents.serverless.service.provider.apiKeys = [
        { free: [{ foo: 'bar' }] },
      ];
      expect(() => awsCompileApigEvents.compileUsagePlanKeys())
        .to.throw(/must be strings/);
    });
  });
});
