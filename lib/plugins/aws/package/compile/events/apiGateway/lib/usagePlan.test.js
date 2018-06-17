'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileUsagePlan()', () => {
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
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
  });

  it('should compile default usage plan resource', () => {
    serverless.service.provider.apiKeys = ['1234567890'];
    return awsCompileApigEvents.compileUsagePlan().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.ApiStages[0].Stage
      ).to.equal('dev');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.Description
      ).to.equal('Usage plan for first-service dev stage');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.UsagePlanName
      ).to.equal('first-service-dev');
    });
  });

  it('should compile custom usage plan resource', () => {
    serverless.service.provider.usagePlan = {
      quota: {
        limit: 500,
        offset: 10,
        period: 'MONTH',
      },
      throttle: {
        burstLimit: 200,
        rateLimit: 100,
      },
    };

    return awsCompileApigEvents.compileUsagePlan().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.ApiStages[0].Stage
      ).to.equal('dev');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.Description
      ).to.equal('Usage plan for first-service dev stage');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.Quota
      ).to.deep.equal({
        Limit: 500,
        Offset: 10,
        Period: 'MONTH',
      });

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.Throttle
      ).to.deep.equal({
        BurstLimit: 200,
        RateLimit: 100,
      });

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.UsagePlanName
      ).to.equal('first-service-dev');
    });
  });

  it('should compile custom usage plan resource with restApiId provided', () => {
    serverless.service.provider.apiKeys = ['1234567890'];
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    };

    return awsCompileApigEvents.compileUsagePlan().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
          ].Properties.ApiStages[0].ApiId
      ).to.equal('xxxxx');
    });
  });
});
