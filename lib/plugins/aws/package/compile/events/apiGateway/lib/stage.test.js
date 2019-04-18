'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let serverless;
  let provider;
  let awsCompileApigEvents;
  let stage;
  let stageLogicalId;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
    awsCompileApigEvents.provider = provider;
    stage = awsCompileApigEvents.provider.getStage();
    stageLogicalId = awsCompileApigEvents.provider.naming
      .getStageLogicalId();
    // mocking the result of a Deployment resource since we remove the stage name
    // when using the Stage resource
    awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[awsCompileApigEvents.apiGatewayDeploymentLogicalId] = {
        Properties: {
          StageName: stage,
        },
      };
  });

  describe('tracing', () => {
    beforeEach(() => {
      // setting up AWS X-Ray tracing
      awsCompileApigEvents.serverless.service.provider.tracing = {
        apiGateway: true,
      };
    });

    it('should create a dedicated stage resource if tracing is configured', () =>
      awsCompileApigEvents.compileStage().then(() => {
        const resources = awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[stageLogicalId]).to.deep.equal({
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            RestApiId: {
              Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
            },
            DeploymentId: {
              Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
            },
            StageName: 'dev',
            Tags: [],
            TracingEnabled: true,
          },
        });

        expect(resources[awsCompileApigEvents.apiGatewayDeploymentLogicalId]).to.deep.equal({
          Properties: {},
        });
      })
    );

    it('should NOT create a dedicated stage resource if tracing is not enabled', () => {
      awsCompileApigEvents.serverless.service.provider.tracing = {};

      return awsCompileApigEvents.compileStage().then(() => {
        const resources = awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        // eslint-disable-next-line
        expect(resources[stageLogicalId]).not.to.exist;

        expect(resources[awsCompileApigEvents.apiGatewayDeploymentLogicalId]).to.deep.equal({
          Properties: {
            StageName: stage,
          },
        });
      });
    });
  });

  describe('tags', () => {
    it('should create a dedicated stage resource if provider.stackTags is configured', () => {
      awsCompileApigEvents.serverless.service.provider.stackTags = {
        foo: '1',
      };

      awsCompileApigEvents.compileStage().then(() => {
        const resources = awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;
        expect(resources[awsCompileApigEvents.apiGatewayDeploymentLogicalId]).to.deep.equal({
          Properties: {},
        });

        expect(resources[stageLogicalId]).to.deep.equal({
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            RestApiId: {
              Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
            },
            DeploymentId: {
              Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
            },
            StageName: stage,
            TracingEnabled: false,
            Tags: [
              { Key: 'foo', Value: '1' },
            ],
          },
        });
      });
    });

    it('should create a dedicated stage resource if provider.tags is configured', () => {
      awsCompileApigEvents.serverless.service.provider.tags = {
        foo: '1',
      };

      awsCompileApigEvents.compileStage().then(() => {
        const resources = awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;
        expect(resources[awsCompileApigEvents.apiGatewayDeploymentLogicalId]).to.deep.equal({
          Properties: {},
        });

        expect(resources[stageLogicalId]).to.deep.equal({
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            RestApiId: {
              Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
            },
            DeploymentId: {
              Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
            },
            StageName: stage,
            TracingEnabled: false,
            Tags: [
              { Key: 'foo', Value: '1' },
            ],
          },
        });
      });
    });

    it('should override provider.stackTags by provider.tags', () => {
      awsCompileApigEvents.serverless.service.provider.stackTags = {
        foo: 'from-stackTags',
        bar: 'from-stackTags',
      };
      awsCompileApigEvents.serverless.service.provider.tags = {
        foo: 'from-tags',
        buz: 'from-tags',
      };

      awsCompileApigEvents.compileStage().then(() => {
        const resources = awsCompileApigEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[stageLogicalId]).to.deep.equal({
          Type: 'AWS::ApiGateway::Stage',
          Properties: {
            RestApiId: {
              Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
            },
            DeploymentId: {
              Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
            },
            StageName: stage,
            TracingEnabled: false,
            Tags: [
              { Key: 'foo', Value: 'from-tags' },
              { Key: 'bar', Value: 'from-stackTags' },
              { Key: 'buz', Value: 'from-tags' },
            ],
          },
        });
      });
    });
  });
});
