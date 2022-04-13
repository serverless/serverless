'use strict';

const chai = require('chai');

const expect = chai.expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const _ = require('lodash');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');
const { createTmpDir } = require('../../../../../../../../../utils/fs');
const runServerless = require('../../../../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

describe('#compileStage()', () => {
  let awsCompileWebsocketsEvents;
  let stageLogicalId;
  let logGroupLogicalId;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    const serverless = new Serverless({ commands: [], options: {} });
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'my-service';
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.serviceDir = createTmpDir();
    serverless.cli = { log: () => {} };

    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless, options);
    stageLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsStageLogicalId();
    logGroupLogicalId = awsCompileWebsocketsEvents.provider.naming.getWebsocketsLogGroupLogicalId();
    awsCompileWebsocketsEvents.websocketsApiLogicalId =
      awsCompileWebsocketsEvents.provider.naming.getWebsocketsApiLogicalId();
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
            StageName: 'dev',
            Description: 'Serverless Websockets',
            AccessLogSettings: {
              DestinationArn: {
                'Fn::Sub':
                  'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:${WebsocketsLogGroup}',
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

    it('should use valid logging level', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.logs = {
        websocket: {
          level: 'ERROR',
        },
      };

      return awsCompileWebsocketsEvents.compileStage().then(() => {
        const resources =
          awsCompileWebsocketsEvents.serverless.service.provider.compiledCloudFormationTemplate
            .Resources;

        expect(resources[stageLogicalId].Properties.DefaultRouteSettings.LoggingLevel).equal(
          'ERROR'
        );
      });
    });

    it('should reject invalid logging level', () => {
      awsCompileWebsocketsEvents.serverless.service.provider.logs = {
        websocket: {
          level: 'FOOBAR',
        },
      };

      expect(awsCompileWebsocketsEvents.compileStage()).to.be.rejectedWith('invalid value');
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

describe('lib/plugins/aws/package/compile/events/websockets/lib/stage.test.js', () => {
  describe('logs with several custom options', () => {
    let resource;
    const customLogFormat = ['$context.identity.sourceIp', '$context.requestId'].join(' ');

    before(() =>
      runServerless({
        fixture: 'websocket',
        configExt: {
          provider: {
            logs: {
              websocket: {
                format: customLogFormat,
                fullExecutionData: false,
                level: 'ERROR',
              },
            },
          },
        },
        command: 'package',
      }).then(({ cfTemplate, awsNaming }) => {
        const stageLogicalId = awsNaming.getWebsocketsStageLogicalId();
        resource = cfTemplate.Resources[stageLogicalId];
      })
    );

    it('should set a specific log Format if provider has format option', async () => {
      expect(resource.Properties.AccessLogSettings.Format).to.equal(customLogFormat);
    });

    it('should set DataTraceEnabled if provider has fullExecutionData option', async () => {
      expect(resource.Properties.DefaultRouteSettings.DataTraceEnabled).to.equal(false);
    });

    it('should set LoggingLevel if provider has level option', async () => {
      expect(resource.Properties.DefaultRouteSettings.LoggingLevel).to.equal('ERROR');
    });

    it('should set accessLogging true as default value', async () => {
      expect(resource.Properties.AccessLogSettings.DestinationArn).to.deep.equal({
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:${WebsocketsLogGroup}',
      });
    });

    it('should set executionLogging true as default value', async () => {
      expect(resource.Properties.DefaultRouteSettings.LoggingLevel).to.not.equal('OFF');
    });
  });

  describe('logs with full custom options', () => {
    let resource;
    const customLogFormat = ['$context.identity.sourceIp', '$context.requestId'].join(' ');

    before(async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'websocket',
        configExt: {
          provider: {
            logs: {
              websocket: {
                accessLogging: false,
                executionLogging: false,
                fullExecutionData: true,
                level: 'ERROR',
                format: customLogFormat,
              },
            },
          },
        },
        command: 'package',
      });
      const stageLogicalId = awsNaming.getWebsocketsStageLogicalId();
      resource = cfTemplate.Resources[stageLogicalId];
    });

    it('should set accessLogging off', async () => {
      expect(resource.Properties.AccessLogSettings).to.be.undefined;
    });

    it('should set executionLogging off', async () => {
      expect(resource.Properties.DefaultRouteSettings.LoggingLevel).to.equal('OFF');
    });

    it('should set fullExecutionData true', async () => {
      expect(resource.Properties.DefaultRouteSettings.DataTraceEnabled).to.equal(true);
    });
  });
});
