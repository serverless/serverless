'use strict';

const _ = require('lodash');
const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileUsagePlanKeys()', () => {
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
    const defaultUsagePlanLogicalId = awsCompileApigEvents.provider.naming.getUsagePlanLogicalId();
    awsCompileApigEvents.apiGatewayUsagePlanNames = ['default'];
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      apiKeys: ['1234567890', { name: 'abcdefghij', value: 'abcdefghijvalue' }],
    };

    awsCompileApigEvents.compileUsagePlanKeys();
    // key 1
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
      ].Type
    ).to.equal('AWS::ApiGateway::UsagePlanKey');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
      ].Properties.KeyId.Ref
    ).to.equal('ApiGatewayApiKey1');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
      ].Properties.KeyType
    ).to.equal('API_KEY');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(1)
      ].Properties.UsagePlanId.Ref
    ).to.equal(defaultUsagePlanLogicalId);

    // key 2
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
      ].Type
    ).to.equal('AWS::ApiGateway::UsagePlanKey');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
      ].Properties.KeyId.Ref
    ).to.equal('ApiGatewayApiKey2');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
      ].Properties.KeyType
    ).to.equal('API_KEY');
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(2)
      ].Properties.UsagePlanId.Ref
    ).to.equal(defaultUsagePlanLogicalId);
  });

  describe('when using usage plan notation', () => {
    it('should support usage plan notation', () => {
      const freeUsagePlanName = 'free';
      const paidUsagePlanName = 'paid';
      const logicalIds = {
        free: awsCompileApigEvents.provider.naming.getUsagePlanLogicalId(freeUsagePlanName),
        paid: awsCompileApigEvents.provider.naming.getUsagePlanLogicalId(paidUsagePlanName),
      };
      awsCompileApigEvents.apiGatewayUsagePlanNames = [freeUsagePlanName, paidUsagePlanName];
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        apiKeys: [
          { free: ['1234567890', { name: 'abcdefghij', value: 'abcdefghijvalue' }] },
          { paid: ['0987654321', 'jihgfedcba'] },
        ],
      };

      awsCompileApigEvents.compileUsagePlanKeys();
      awsCompileApigEvents.serverless.service.provider.apiGateway.apiKeys.forEach((plan) => {
        const planName = Object.keys(plan)[0]; // free || paid
        const apiKeys = plan[planName];
        apiKeys.forEach((apiKey, index) => {
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(index + 1, planName)
            ].Type
          ).to.equal('AWS::ApiGateway::UsagePlanKey');
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(index + 1, planName)
            ].Properties.KeyId.Ref
          ).to.equal(`ApiGatewayApiKey${_.capitalize(planName)}${index + 1}`);
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(index + 1, planName)
            ].Properties.KeyType
          ).to.equal('API_KEY');
          expect(
            awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
              .Resources[
              awsCompileApigEvents.provider.naming.getUsagePlanKeyLogicalId(index + 1, planName)
            ].Properties.UsagePlanId.Ref
          ).to.equal(logicalIds[planName]);
        });
      });
    });

    it('should throw if api key name does not match a usage plan', () => {
      awsCompileApigEvents.apiGatewayUsagePlanNames = ['default'];
      awsCompileApigEvents.serverless.service.provider.apiGateway = {
        apiKeys: [{ free: ['1234567890'] }],
      };
      expect(() => awsCompileApigEvents.compileUsagePlanKeys()).to.throw(
        /has no usage plan defined/
      );
    });
  });
});
