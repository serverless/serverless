'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let serverless;
  let awsCompileApigEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'first-service';
    serverless.service.provider = {
      name: 'aws',
      apiKeys: ['1234567890'],
    };
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeploymentTest';
  });

  it('should compile stage resource', () =>
    awsCompileApigEvents.compileStage().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getStageLogicalId()
          ].Type
      ).to.equal('AWS::ApiGateway::Stage');

      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
          awsCompileApigEvents.provider.naming.getStageLogicalId()
          ].Properties
      ).to.deep.equal({
        DeploymentId: {
          Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId,
        },
        RestApiId: {
          Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
        },
        StageName: 'dev',
      });
    })
  );
});
