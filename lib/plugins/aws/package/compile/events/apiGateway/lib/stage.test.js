'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let serverless;
  let provider;
  let awsCompileApigEvents;

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
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'DeploymentId';
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.provider = provider;
  });

  it('should add tag from provider.stackTags and provider.tags', () => {
    provider.stackTags = {
      foo: 'bar',
      // override stage
      STAGE: 'middle-priority',
    };
    provider.tags = {
      // override stackTags
      foo: 'high-priority',
    };

    awsCompileApigEvents.compileStage().then(() => {
      const template = awsCompileApigEvents.serverless.service.provider
        .compiledCloudFormationTemplate;
      const stageLogicalId = Object.keys(template.Resources)[0];

      expect(template.Resources[stageLogicalId]).to.deep.equal({
        Type: 'AWS::ApiGateway::Stage',
        Properties: {
          DeploymentId: {
            Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
          },
          RestApiId: {
            Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
          },
          StageName: 'dev',
          Tags: [
            { Key: 'STAGE', Value: 'middle-priority' },
            { Key: 'foo', Value: 'high-priority' },
          ],
        },
      });
    });
  });
});
