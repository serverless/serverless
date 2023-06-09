'use strict';

const expect = require('chai').expect;
const assert = require('chai').assert;
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileAuthorizers()', () => {
  let awsCompileWebsocketsEvents;

  describe('for routes with authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless({ commands: [], options: {} });
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
      serverless.service.functions = {
        auth: {},
      };
      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

      awsCompileWebsocketsEvents.websocketsApiLogicalId =
        awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();

      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'auth',
              uri: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':apigateway:',
                    { Ref: 'AWS::Region' },
                    ':lambda:path/2015-03-31/functions/',
                    { 'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'] },
                    '/invocations',
                  ],
                ],
              },
              identitySource: ['route.request.header.Auth'],
            },
          },
        ],
      };
    });

    it('should create authorizer for externally managed authorizer function', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'external-authorizer',
              managedExternally: true,
              identitySource: ['route.request.header.Auth'],
              uri: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':apigateway:',
                    { Ref: 'AWS::Region' },
                    ':lambda:path/2015-03-31/functions/',
                    {
                      'Fn::GetAtt': ['ExternalDashauthorizerLambdaFunction', 'Arn'],
                    },
                    '/invocations',
                  ],
                ],
              },
            },
          },
        ],
      };
      awsCompileWebsocketsEvents.compileAuthorizers();
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      expect(resources).to.deep.equal({
        ExternalDashauthorizerWebsocketsAuthorizer: {
          DependsOn: [],
          Type: 'AWS::ApiGatewayV2::Authorizer',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            Name: 'external-authorizer',
            AuthorizerType: 'REQUEST',
            AuthorizerUri: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':apigateway:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':lambda:path/2015-03-31/functions/',
                  {
                    'Fn::GetAtt': ['ExternalDashauthorizerLambdaFunction', 'Arn'],
                  },
                  '/invocations',
                ],
              ],
            },
            IdentitySource: ['route.request.header.Auth'],
          },
        },
      });
    });

    it.only('should fail when managedExternally is not set and authorizer is not defined', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
            authorizer: {
              name: 'external-authorizer',
              identitySource: ['route.request.header.Auth'],
              uri: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':apigateway:',
                    { Ref: 'AWS::Region' },
                    ':lambda:path/2015-03-31/functions/',
                    {
                      'Fn::GetAtt': ['ExternalDashauthorizerLambdaFunction', 'Arn'],
                    },
                    '/invocations',
                  ],
                ],
              },
            },
          },
        ],
      };
      assert.throws(
        () => awsCompileWebsocketsEvents.compileAuthorizers(),
        /Function "external-authorizer" doesn't exist in this Service/
      );
    });

    it('should create an authorizer resource', () => {
      awsCompileWebsocketsEvents.compileAuthorizers();
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      expect(resources).to.deep.equal({
        AuthWebsocketsAuthorizer: {
          DependsOn: undefined,
          Type: 'AWS::ApiGatewayV2::Authorizer',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            Name: 'auth',
            AuthorizerType: 'REQUEST',
            AuthorizerUri: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':apigateway:',
                  {
                    Ref: 'AWS::Region',
                  },
                  ':lambda:path/2015-03-31/functions/',
                  {
                    'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'],
                  },
                  '/invocations',
                ],
              ],
            },
            IdentitySource: ['route.request.header.Auth'],
          },
        },
      });
    });

    it('should use existing Api if there is predefined websocketApi config', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: '5ezys3sght',
      };

      awsCompileWebsocketsEvents.compileAuthorizers();
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      expect(resources.AuthWebsocketsAuthorizer.Properties).to.contain({
        ApiId: '5ezys3sght',
      });
    });
  });

  describe('for routes without authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless({ commands: [], options: {} });
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

      awsCompileWebsocketsEvents.websocketsApiLogicalId =
        awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();

      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
          },
        ],
      };
    });

    it('should NOT create an authorizer resource for routes with not authorizer definition', () => {
      awsCompileWebsocketsEvents.validated = {
        events: [
          {
            functionName: 'First',
            route: '$connect',
          },
        ],
      };

      awsCompileWebsocketsEvents.compileAuthorizers();
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      expect(resources).to.deep.equal({});
    });
  });
});
