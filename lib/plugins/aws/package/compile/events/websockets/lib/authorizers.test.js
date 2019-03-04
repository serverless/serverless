'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileAuthorizers()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId
      = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
  });

  it('should create an authorizer resource for routes with authorizer definition', () => {
    awsCompileWebsocketsEvents.validated = {
      events: [
        {
          functionName: 'First',
          route: '$connect',
          authorizer: {
            name: 'auth',
            uri: {
              'Fn::Join': ['',
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

    return awsCompileWebsocketsEvents.compileAuthorizers().then(() => {
      const resources = awsCompileWebsocketsEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources;

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
                    'Fn::GetAtt': [
                      'AuthLambdaFunction',
                      'Arn',
                    ],
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
      const resources = awsCompileWebsocketsEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources;

      expect(resources).to.deep.equal({});
    });
  });
});
