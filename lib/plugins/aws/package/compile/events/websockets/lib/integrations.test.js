'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileIntegrations()', () => {
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    awsCompileWebsocketsEvents.websocketsApiLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
  });

  it('should create an integration resource for every event', () => {
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

    return awsCompileWebsocketsEvents.compileIntegrations().then(() => {
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;

      expect(resources).to.deep.equal({
        FirstWebsocketsIntegration: {
          Type: 'AWS::ApiGatewayV2::Integration',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            IntegrationType: 'AWS_PROXY',
            IntegrationUri: {
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
                    'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
                  },
                  '/invocations',
                ],
              ],
            },
          },
        },
        SecondWebsocketsIntegration: {
          Type: 'AWS::ApiGatewayV2::Integration',
          Properties: {
            ApiId: {
              Ref: 'WebsocketsApi',
            },
            IntegrationType: 'AWS_PROXY',
            IntegrationUri: {
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
                    'Fn::GetAtt': ['SecondLambdaFunction', 'Arn'],
                  },
                  '/invocations',
                ],
              ],
            },
          },
        },
      });
    });
  });
});
