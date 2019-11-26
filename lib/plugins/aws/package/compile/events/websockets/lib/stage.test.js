'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const _ = require('lodash');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#compileStage()', () => {
  let awsCompileWebsocketsEvents;
  let stageLogicalId;
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
    serverless.config.servicePath = 'my-service';
    serverless.cli = { log: () => {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless, options);
    stageLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsStageLogicalId();
    logGroupLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsLogGroupLogicalId();
    awsCompileWebsocketsEvents.websocketsApiLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
    awsCompileWebsocketsEvents.websocketsDeploymentLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsDeploymentLogicalId(
      1234
    );
  });

  it('should create a stage resource if no websocketApiId specified', () =>
    awsCompileWebsocketsEvents.compileStage().then(() => {
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;
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
      expect(resources.WebsocketsDeploymentStage.Properties.Description).to.equal(
        'Serverless Websockets'
      );
    }));

  it('should not create a stage resource if a websocketApiId is specified', () => {
    awsCompileWebsocketsEvents.serverless.service.provider.apiGateway = {
      websocketApiId: 'xyz123abc',
    };
    return awsCompileWebsocketsEvents.compileStage().then(() => {
      const resources =
        awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources;
      const resourceKeys = Object.keys(resources);

      expect(resourceKeys.length).to.equal(0);
    });
  });

  describe('logs', () => {
    before(() => sinon.stub(childProcess, 'execAsync'));
    after(() => childProcess.execAsync.restore());
    beforeEach(() => {
      // setting up Websocket logs
      awsCompileWebsocketsEvents.serverless.service.provider.logs = {
        websocket: true,
      };
    });

    it('should create a dedicated stage resource if logs are configured', () =>
      awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

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
                'Fn::Sub':
                  'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${WebsocketsLogGroup}',
              },
              Format: [
                '$context.identity.sourceIp',
                '$context.identity.caller',
                '$context.identity.user',
                '[$context.requestTime]',
                '"$context.eventType $context.routeKey $context.connectionId"',
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
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources[logGroupLogicalId]).to.deep.equal({
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/websocket/my-service-dev',
          },
        });
      }));

    it('should set a RetentionInDays in a Log Group if provider has logRetentionInDays', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.logRetentionInDays = 42;

      return awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources[logGroupLogicalId]).to.deep.equal({
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: '/aws/websocket/my-service-dev',
            RetentionInDays: 42,
          },
        });
      });
    });

    it('should ensure ClousWatch role custom resource', () => {
      return awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(
          _.isObject(
            resources[
              awsCompileWebsocketsEvents.provider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleResourceLogicalId()
            ]
          )
        ).to.equal(true);
      });
    });
  });
});
