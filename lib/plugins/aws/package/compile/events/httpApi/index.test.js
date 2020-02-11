'use strict';

const { expect } = require('chai');
const runServerless = require('../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../tests/fixtures');

describe('HttpApiEvents', () => {
  after(fixtures.cleanup);

  it('Should not configure HTTP when events are not configured', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      cliArgs: ['package'],
    }).then(serverless => {
      const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverless.getProvider('aws').naming;

      expect(cfResources[naming.getHttpApiLogicalId()]).to.equal();
      expect(cfResources[naming.getHttpApiStageLogicalId()]).to.equal();
    }));

  describe('Specific endpoints', () => {
    let cfResources;
    let cfOutputs;
    let naming;

    before(() =>
      runServerless({
        cwd: fixtures.map.httpApiNoCatchAll,
        cliArgs: ['package'],
      }).then(serverless => {
        ({
          Resources: cfResources,
          Outputs: cfOutputs,
        } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
    );

    it('Should configure API resource', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Api');
      expect(resource.Properties).to.have.property('Name');
      expect(resource.Properties.ProtocolType).to.equal('HTTP');
    });

    it('Should not configure default route', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties).to.not.have.property('RputeKey');
      expect(resource.Properties).to.not.have.property('Target');
    });
    it('Should configure stage resource', () => {
      const resource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Stage');
      expect(resource.Properties.StageName).to.equal('dev');
      expect(resource.Properties.AutoDeploy).to.equal(true);
    });
    it('Should configure output', () => {
      const output = cfOutputs.HttpApiUrl;
      expect(output).to.have.property('Value');
    });
    it('Should configure endpoint', () => {
      const routeKey = 'POST /some-post';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });
    it('Should configure endpoint integration', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
    });
    it('Should configure lambda permissions', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
  });

  describe('Catch-all endpoints', () => {
    let cfResources;
    let cfOutputs;
    let naming;

    before(() =>
      runServerless({
        cwd: fixtures.map.httpApiCatchAll,
        cliArgs: ['package'],
      }).then(serverless => {
        ({
          Resources: cfResources,
          Outputs: cfOutputs,
        } = serverless.service.provider.compiledCloudFormationTemplate);
        naming = serverless.getProvider('aws').naming;
      })
    );

    it('Should configure API resource', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Api');
      expect(resource.Properties).to.have.property('Name');
      expect(resource.Properties.ProtocolType).to.equal('HTTP');
    });

    it('Should configure default route', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties.RouteKey).to.equal('$default');
      expect(resource.Properties).to.have.property('Target');
    });
    it('Should configure stage resource', () => {
      const resource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Stage');
      expect(resource.Properties.StageName).to.equal('dev');
      expect(resource.Properties.AutoDeploy).to.equal(true);
    });
    it('Should configure output', () => {
      const output = cfOutputs.HttpApiUrl;
      expect(output).to.have.property('Value');
    });
    it('Should configure catch all endpoint', () => {
      const routeKey = 'ANY /foo';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });
    it('Should configure endpoint integration', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('other')];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
    });
    it('Should configure lambda permissions for global catch all target', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
    it('Should configure lambda permissions for path catch all target', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('other')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
  });
});
