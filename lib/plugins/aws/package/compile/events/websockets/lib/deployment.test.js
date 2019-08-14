'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileDeployment()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
  });

  it('should create a deployment resource and output', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
        },
        {
          functionName: 'Second',
          route: '$disconnect',
        },
      ],
    };

    return awsCompileWebsocketsEvents.compileDeployment().then(() => {
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;
      const outputs =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs;

      const deploymentLogicalId = Object.keys(resources)[0];

      expect(deploymentLogicalId).to.match(/WebsocketsDeployment/);
      expect(resources[deploymentLogicalId]).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Deployment',
        DependsOn: ['SconnectWebsocketsRoute', 'SdisconnectWebsocketsRoute'],
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          Description: 'Serverless Websockets',
        },
      });
      expect(outputs).to.deep.equal({
        ServiceEndpointWebsocket: {
          Description: 'URL of the service endpoint',
          Value: {
            'Fn::Join': [
              '',
              [
                'wss://',
                {
                  Ref: 'WebsocketsApi',
                },
                '.execute-api.',
                {
                  Ref: 'AWS::Region',
                },
                '.',
                {
                  Ref: 'AWS::URLSuffix',
                },
                '/dev',
              ],
            ],
          },
        },
      });
    });
  });

  it('should create a deployment resource with stage reference if websocketApiId is specified', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
        },
        {
          functionName: 'Second',
          route: '$disconnect',
        },
      ],
    };
    awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
      websocketApiId: 'xyz123abc',
    };

    return awsCompileWebsocketsEvents.compileDeployment().then(() => {
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      const deploymentLogicalId = Object.keys(resources)[0];

      expect(deploymentLogicalId).to.match(/WebsocketsDeployment/);
      expect(resources[deploymentLogicalId]).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Deployment',
        DependsOn: ['SconnectWebsocketsRoute', 'SdisconnectWebsocketsRoute'],
        Properties: {
          ApiId: 'xyz123abc',
          StageName: awsCompileWebsocketsEvents.provider.getStage(),
          Description: 'Serverless Websockets',
        },
      });
    });
  });
});
