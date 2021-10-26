'use strict';

const expect = require('chai').expect;
const AwsCompileApigEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/apiGateway/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileDeployment()', () => {
  let serverless;
  let provider;
  let awsCompileApigEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: [], options: {} });
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi';
    awsCompileApigEvents.apiGatewayMethodLogicalIds = ['method-dependency1', 'method-dependency2'];
    awsCompileApigEvents.provider = provider;
  });

  it('should create a deployment resource', () => {
    awsCompileApigEvents.compileDeployment();
    const apiGatewayDeploymentLogicalId = Object.keys(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
    )[0];

    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        apiGatewayDeploymentLogicalId
      ]
    ).to.deep.equal({
      Type: 'AWS::ApiGateway::Deployment',
      DependsOn: ['method-dependency1', 'method-dependency2'],
      Properties: {
        RestApiId: {
          Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
        },
        Description: undefined,
        StageName: 'dev',
      },
    });
  });

  it('should create a deployment resource with description', () => {
    awsCompileApigEvents.serverless.service.provider.apiGateway = {
      description: 'Some Description',
    };

    awsCompileApigEvents.compileDeployment();
    const apiGatewayDeploymentLogicalId = Object.keys(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources
    )[0];

    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources[
        apiGatewayDeploymentLogicalId
      ]
    ).to.deep.equal({
      Type: 'AWS::ApiGateway::Deployment',
      DependsOn: ['method-dependency1', 'method-dependency2'],
      Properties: {
        RestApiId: {
          Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId,
        },
        Description: 'Some Description',
        StageName: 'dev',
      },
    });
  });

  it('should add service endpoint output', () => {
    awsCompileApigEvents.compileDeployment();
    expect(
      awsCompileApigEvents.serverless.service.provider.compiledCloudFormationTemplate.Outputs
        .ServiceEndpoint
    ).to.deep.equal({
      Description: 'URL of the service endpoint',
      Value: {
        'Fn::Join': [
          '',
          [
            'https://',
            { Ref: awsCompileApigEvents.apiGatewayRestApiLogicalId },
            '.execute-api.',
            { Ref: 'AWS::Region' },
            '.',
            { Ref: 'AWS::URLSuffix' },
            '/dev',
          ],
        ],
      },
    });
  });
});
