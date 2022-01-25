'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileRoutes()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId =
      awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
  });

  it('should create a route resource for every event', () => {
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

    awsCompileWebsocketsEvents.compileRoutes();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.deep.equal({
      SconnectWebsocketsRoute: {
        Type: 'AWS::ApiGatewayV2::Route',
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          RouteKey: '$connect',
          AuthorizationType: 'NONE',
          Target: {
            'Fn::Join': [
              '/',
              [
                'integrations',
                {
                  Ref: 'FirstWebsocketsIntegration',
                },
              ],
            ],
          },
        },
      },
      SdisconnectWebsocketsRoute: {
        Type: 'AWS::ApiGatewayV2::Route',
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          RouteKey: '$disconnect',
          AuthorizationType: 'NONE',
          Target: {
            'Fn::Join': [
              '/',
              [
                'integrations',
                {
                  Ref: 'SecondWebsocketsIntegration',
                },
              ],
            ],
          },
        },
      },
    });
  });

  it('should set routeResponseSelectionExpression when configured', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
          routeResponseSelectionExpression: '$default',
        },
      ],
    };

    awsCompileWebsocketsEvents.compileRoutes();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.deep.equal({
      SconnectWebsocketsRoute: {
        Type: 'AWS::ApiGatewayV2::Route',
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          RouteKey: '$connect',
          AuthorizationType: 'NONE',
          RouteResponseSelectionExpression: '$default',
          Target: {
            'Fn::Join': [
              '/',
              [
                'integrations',
                {
                  Ref: 'FirstWebsocketsIntegration',
                },
              ],
            ],
          },
        },
      },
    });
  });

  it('should set authorizer property for the connect route', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
          authorizer: {
            name: 'auth',
          },
        },
      ],
    };

    awsCompileWebsocketsEvents.compileRoutes();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.deep.equal({
      SconnectWebsocketsRoute: {
        Type: 'AWS::ApiGatewayV2::Route',
        Properties: {
          ApiId: {
            Ref: 'WebsocketsApi',
          },
          RouteKey: '$connect',
          AuthorizationType: 'CUSTOM',
          AuthorizerId: {
            Ref: awsCompileWebsocketsEvents.provider.naming.getWebsocketsAuthorizerLogicalId(
              'auth'
            ),
          },
          Target: {
            'Fn::Join': [
              '/',
              [
                'integrations',
                {
                  Ref: 'FirstWebsocketsIntegration',
                },
              ],
            ],
          },
        },
      },
    });
  });
});
