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
    awsCompileApigEvents.apiGatewayDeploymentLogicalId = 'ApiGatewayDeployment';
  });

  it('should create a stage resource', () => awsCompileApigEvents
    .compileStage().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.ApiGatewayStage
      ).to.deep.equal({
        Type: 'AWS::ApiGateway::Stage',
        DependsOn: [awsCompileApigEvents.apiGatewayDeploymentLogicalId],
        Properties: {
          RestApiId: { Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId },
          DeploymentId: { Ref: awsCompileApigEvents.apiGatewayDeploymentLogicalId },
          StageName: 'dev',
        },
      });
    })
  );

  it('should add service endpoint output', () =>
    awsCompileApigEvents.compileStage().then(() => {
      expect(
        awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs.ServiceEndpoint
      ).to.deep.equal({
        Description: 'URL of the service endpoint',
        Value: {
          'Fn::Join': [
            '',
            [
              'https://',
              { Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId },
              '.execute-api.us-east-1.amazonaws.com/dev',
            ],
          ],
        },
      });
    })
  );
});
