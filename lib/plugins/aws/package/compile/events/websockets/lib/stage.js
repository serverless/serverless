'use strict';

const BbPromise = require('bluebird');
const ensureApiGatewayCloudWatchRole = require('../../lib/ensure-api-gateway-cloud-watch-role');
const ServerlessError = require('../../../../../../../serverless-error');

const defaultLogLevel = 'INFO';
const validLogLevels = new Set(['INFO', 'ERROR']);
const defaultLogFormat = [
  '$context.identity.sourceIp',
  '$context.identity.caller',
  '$context.identity.user',
  '[$context.requestTime]',
  '"$context.eventType $context.routeKey $context.connectionId"',
  '$context.requestId',
].join(' ');

module.exports = {
  async compileStage() {
    return BbPromise.try(() => {
      const { service, provider } = this.serverless.service;
      const stage = this.options.stage;
      const cfTemplate = provider.compiledCloudFormationTemplate;

      // immediately return if we're using an external websocket API id
      // stage will be updated as part of the AWS::ApiGatewayV2::Deployment for the websocket
      if (provider.apiGateway && provider.apiGateway.websocketApiId) return null;

      // logs
      const logs = provider.logs && provider.logs.websocket;

      const stageLogicalId = this.provider.naming.getWebsocketsStageLogicalId();
      const logGroupLogicalId = this.provider.naming.getWebsocketsLogGroupLogicalId();

      const stageResource = {
        Type: 'AWS::ApiGatewayV2::Stage',
        Properties: {
          ApiId: this.provider.getApiGatewayWebsocketApiId(),
          // DeploymentId is generated at deployment.js file
          StageName: this.provider.getStage(),
          Description:
            this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
        },
      };

      Object.assign(cfTemplate.Resources, { [stageLogicalId]: stageResource });

      if (!logs) return null;

      const accessLogging = logs.accessLogging == null ? true : logs.accessLogging;
      const executionLogging = logs.executionLogging == null ? true : logs.executionLogging;
      const fullExecutionData = logs.fullExecutionData == null ? true : logs.fullExecutionData;

      let logFormat = defaultLogFormat;
      if (logs.format) {
        logFormat = logs.format;
      }

      let level = defaultLogLevel;
      if (!executionLogging) {
        level = 'OFF';
      } else if (logs.level) {
        level = logs.level;
        if (!validLogLevels.has(level)) {
          throw new ServerlessError(
            `provider.logs.websocket.level is set to an invalid value. Support values are ${Array.from(
              validLogLevels
            ).join(', ')}, got ${level}.`,
            'WEBSOCKETS_INVALID_LOGS_LEVEL'
          );
        }
      }

      // create log-specific resources
      const logProperties = {
        DefaultRouteSettings: {
          DataTraceEnabled: fullExecutionData,
          LoggingLevel: level,
        },
      };
      if (accessLogging) {
        logProperties.AccessLogSettings = {
          DestinationArn: {
            'Fn::Sub': `arn:\${AWS::Partition}:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:\${${logGroupLogicalId}}`,
          },
          Format: logFormat,
        };
      }
      Object.assign(stageResource.Properties, logProperties);

      Object.assign(cfTemplate.Resources, {
        [logGroupLogicalId]: getLogGroupResource(service, stage, this.provider),
      });

      return ensureApiGatewayCloudWatchRole(this.provider);
    });
  },
};

function getLogGroupResource(service, stage, provider) {
  const resource = {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: `/aws/websocket/${service}-${stage}`,
    },
  };
  const logRetentionInDays = provider.getLogRetentionInDays();
  if (logRetentionInDays) {
    resource.Properties.RetentionInDays = logRetentionInDays;
  }
  const logDataProtectionPolicy = provider.getLogDataProtectionPolicy();
  if (logDataProtectionPolicy) {
    resource.Properties.DataProtectionPolicy = logDataProtectionPolicy;
  }
  return resource;
}
