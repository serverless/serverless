'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let awsCompileWebsocketsEvents;
  let stageLogicalId;
  let accountLogicalid;
  let logsRoleLogicalId;
  let logGroupLogicalId;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    const serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'my-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless, options);
    stageLogicalId = awsCompileWebsocketsEvents.provider.naming
      .getWebsocketsStageLogicalId();
    accountLogicalid = awsCompileWebsocketsEvents.provider.naming
      .getWebsocketsAccountLogicalId();
    logsRoleLogicalId = awsCompileWebsocketsEvents.provider.naming
      .getWebsocketsLogsRoleLogicalId();
    logGroupLogicalId = awsCompileWebsocketsEvents.provider.naming
      .getWebsocketsLogGroupLogicalId();
    awsCompileWebsocketsEvents.websocketsApiLogicalId
      = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
    awsCompileWebsocketsEvents.websocketsDeploymentLogicalId
      = awsCompileWebsocketsEvents.provider.naming.getWebsocketsDeploymentLogicalId(1234);
  });

  it('should create a stage resource', () => awsCompileWebsocketsEvents.compileStage().then(() => {
    const resources = awsCompileWebsocketsEvents.serverless.service.provider
      .compiledCloudFormationTemplate.Resources;
    const resourceKeys = Object.keys(resources);

    expect(resourceKeys[0]).to.equal(stageLogicalId);
    expect(resources.WebsocketsDeploymentStage.Type).to.equal('AWS::ApiGatewayV2::Stage');
    expect(resources.WebsocketsDeploymentStage.Properties.ApiId).to.deep.equal({
      Ref: awsCompileWebsocketsEvents.websocketsApiLogicalId,
    });
    expect(resources.WebsocketsDeploymentStage.Properties.DeploymentId).to.deep.equal({
      Ref: awsCompileWebsocketsEvents.websocketsDeploymentLogicalId,
    });
    expect(resources.WebsocketsDeploymentStage.Properties.StageName).to.equal('dev');
    expect(resources.WebsocketsDeploymentStage.Properties.Description)
      .to.equal('Serverless Websockets');
  }));

  describe('logs', () => {
    beforeEach(() => {
      // setting up Websocket logs
      awsCompileWebsocketsEvents.serverless.service.provider.logs = {
        websocket: true,
      };
    });

    it('should create a dedicated stage resource if logs are configured', () =>
      awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources = awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[stageLogicalId]).to.deep.equal({
          Type: 'AWS::ApiGatewayV2::Stage',
          Properties: {
            ApiId: {
              Ref: awsCompileWebsocketsEvents.websocketsApiLogicalId,
            },
            DeploymentId: {
              Ref: awsCompileWebsocketsEvents.websocketsDeploymentLogicalId,
            },
            StageName: 'dev',
            Description: 'Serverless Websockets',
            AccessLogSettings: {
              DestinationArn: {
                'Fn::GetAtt': [
                  logGroupLogicalId,
                  'Arn',
                ],
              },
              Format: [
                '$context.identity.sourceIp',
                '$context.identity.caller',
                '$context.identity.user',
                '[$context.requestTime]',
                '"$context.eventType $context.routeKey $context.connectionId"',
                '$context.status',
                '$context.requestId',
              ].join(' '),
            },
            DefaultRouteSettings: {
              DataTraceEnabled: true,
              LoggingLevel: 'INFO',
            },
          },
        });
      }));

    it('should create a Log Group resource', () =>
      awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources = awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[logGroupLogicalId]).to.deep.equal({
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/websocket/my-service-dev',
          },
        });
      }));

    it('should create a IAM Role resource', () =>
      awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources = awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[logsRoleLogicalId]).to.deep.equal({
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: [
                    'sts:AssumeRole',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: [
                      'apigateway.amazonaws.com',
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs',
            ],
            Path: '/',
            RoleName: {
              'Fn::Join': [
                '-',
                [
                  'my-service',
                  'dev',
                  {
                    Ref: 'AWS::Region',
                  },
                  'apiGatewayLogsRole',
                ],
              ],
            },
          },
        });
      }));

    it('should create an Account resource', () =>
      awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources = awsCompileWebsocketsEvents.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[accountLogicalid]).to.deep.equal({
          Type: 'AWS::ApiGateway::Account',
          Properties: {
            CloudWatchRoleArn: {
              'Fn::GetAtt': [
                logsRoleLogicalId,
                'Arn',
              ],
            },
          },
        });
      }));
  });
});
