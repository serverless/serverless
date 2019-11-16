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
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Properties.ApiStages[0].Stage
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Properties.Description
      ).to.equal('Usage plan for first-service dev stage');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Properties.UsagePlanName
      ).to.equal('first-service-dev');

      expect(awsCompileApigEvents.apiGatewayUsagePlanNames).to.deep.equal(['default']);
    });
  });

  it('should support custom usage plan resource via single object notation', () => {
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
      const logicalId = awsCompileApigEvents.provider.naming.getUsagePlanLogicalId();

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.ApiStages[0].Stage
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.Description
      ).to.equal('Usage plan for first-service dev stage');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.Quota
      ).to.deep.equal({
        Limit: 500,
        Offset: 10,
        Period: 'MONTH',
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.Throttle
      ).to.deep.equal({
        BurstLimit: 200,
        RateLimit: 100,
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalId
        ].Properties.UsagePlanName
      ).to.equal('first-service-dev');

      expect(awsCompileApigEvents.apiGatewayUsagePlanNames).to.deep.equal(['default']);
    });
  });

  it('should support custom usage plan resources via array notation', () => {
    const freePlanName = 'free';
    const paidPlanName = 'paid';
    const logicalIdFree = awsCompileApigEvents.provider.naming.getUsagePlanLogicalId(freePlanName);
    const logicalIdPaid = awsCompileApigEvents.provider.naming.getUsagePlanLogicalId(paidPlanName);

    serverless.service.provider.usagePlan = [
      {
        [freePlanName]: {
          quota: {
            limit: 1000,
            offset: 100,
            period: 'MONTH',
          },
          throttle: {
            burstLimit: 1,
            rateLimit: 1,
          },
        },
      },
      {
        [paidPlanName]: {
          quota: {
            limit: 1000000,
            offset: 200,
            period: 'MONTH',
          },
          throttle: {
            burstLimit: 1000,
            rateLimit: 1000,
          },
        },
      },
    ];

    return awsCompileApigEvents.compileUsagePlan().then(() => {
      // resources for the "free" plan
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.ApiStages[0].Stage
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.Description
      ).to.equal(`Usage plan "${freePlanName}" for first-service dev stage`);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.Quota
      ).to.deep.equal({
        Limit: 1000,
        Offset: 100,
        Period: 'MONTH',
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.Throttle
      ).to.deep.equal({
        BurstLimit: 1,
        RateLimit: 1,
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdFree
        ].Properties.UsagePlanName
      ).to.equal(`first-service-${freePlanName}-dev`);

      // resources for the "paid" plan
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Type
      ).to.equal('AWS::ApiGateway::UsagePlan');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].DependsOn
      ).to.equal('ApiGatewayDeploymentTest');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.ApiStages[0].ApiId.Ref
      ).to.equal('ApiGatewayRestApi');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.ApiStages[0].Stage
      ).to.equal('dev');
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.Description
      ).to.equal(`Usage plan "${paidPlanName}" for first-service dev stage`);
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.Quota
      ).to.deep.equal({
        Limit: 1000000,
        Offset: 200,
        Period: 'MONTH',
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.Throttle
      ).to.deep.equal({
        BurstLimit: 1000,
        RateLimit: 1000,
      });
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          logicalIdPaid
        ].Properties.UsagePlanName
      ).to.equal(`first-service-${paidPlanName}-dev`);

      expect(awsCompileApigEvents.apiGatewayUsagePlanNames).to.deep.equal([
        freePlanName,
        paidPlanName,
      ]);
    });
  });

  it('should compile custom usage plan resource with restApiId provided', () => {
    serverless.service.provider.apiKeys = ['1234567890'];
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      restApiId: 'xxxxx',
    };

    return awsCompileApigEvents.compileUsagePlan().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          awsCompileApigEvents.provider.naming.getUsagePlanLogicalId()
        ].Properties.ApiStages[0].ApiId
      ).to.equal('xxxxx');
    });
  });
});
