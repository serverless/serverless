'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileAuthorizers()', () => {
  let awsCompileWebsocketsEvents;

  describe('for routes with authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless();
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

      awsCompileWebsocketsEvents.websocketsApiLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();

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

    it('should create an authorizer resource', () => {
      return awsCompileWebsocketsEvents.compileAuthorizers().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources).to.deep.equal({
          AuthWebsocketsAuthorizer: {
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
    });

    it('should use existing Api if there is predefined websocketApi config', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
        websocketApiId: '5ezys3sght',
      };

      return awsCompileWebsocketsEvents.compileAuthorizers().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources.AuthWebsocketsAuthorizer.Properties).to.contain({
          ApiId: '5ezys3sght',
        });
      });
    });
  });

  describe('for routes without authorizer definition', () => {
    beforeEach(() => {
      const serverless = new Serverless();
      serverless.setProvider('aws', new AwsProvider(serverless));
      serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

      awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

      awsCompileWebsocketsEvents.websocketsApiLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();

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

      return awsCompileWebsocketsEvents.compileAuthorizers().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources).to.deep.equal({});
      });
    });
  });
});
