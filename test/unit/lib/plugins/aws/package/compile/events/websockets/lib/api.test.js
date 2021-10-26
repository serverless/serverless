'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/Serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');

describe('#compileApi()', () => {
  let awsCompileWebsocketsEvents;
  let roleLogicalId;

  beforeEach(() => {
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'my-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless);

    roleLogicalId = awsCompileWebsocketsEvents.provider.naming.getRoleLogicalId();
    awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
      {
        [roleLogicalId]: {
          Properties: {
            Policies: [
              {
                PolicyDocument: {
                  Statement: [],
                },
              },
            ],
          },
        },
      };
  });

  it('should create a websocket api resource', () => {
    awsCompileWebsocketsEvents.compileApi();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources.WebsocketsApi).to.deep.equal({
      Type: 'AWS::ApiGatewayV2::Api',
      Properties: {
        Name: 'dev-my-service-websockets',
        RouteSelectionExpression: '$request.body.action',
        Description: 'Serverless Websockets',
        ProtocolType: 'WEBSOCKET',
      },
    });
  });

  it('should ignore API resource creation if there is predefined websocketApi config', () => {
    awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
      websocketApiId: '5ezys3sght',
    };
    awsCompileWebsocketsEvents.compileApi();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources).to.not.have.property('WebsocketsApi');
  });

  it('should add the websockets policy', () => {
    awsCompileWebsocketsEvents.compileApi();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources[roleLogicalId]).to.deep.equal({
      Properties: {
        Policies: [
          {
            PolicyDocument: {
              Statement: [
                {
                  Action: ['execute-api:ManageConnections'],
                  Effect: 'Allow',
                  Resource: [
                    { 'Fn::Sub': 'arn:${AWS::Partition}:execute-api:*:*:*/@connections/*' },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
  });

  it('should NOT add the websockets policy if role resource does not exist', () => {
    awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
      {};

    awsCompileWebsocketsEvents.compileApi();
    const resources =
      awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources;

    expect(resources[roleLogicalId]).to.deep.equal(undefined);
  });
});
