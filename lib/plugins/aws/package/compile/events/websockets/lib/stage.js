'use strict';

const BbPromise = require('bluebird');
const ensureApiGatewayCloudWatchRole = require('../../lib/ensureApiGatewayCloudWatchRole');

module.exports = {
  compileStage() {
    return BbPromise.try(() => {
      const { service, provider } = this.serverless.service;
      const stage = this.options.stage;
      const cfTemplate = provider.compiledCloudFormationTemplate;

      // immediately return if we're using an external websocket API id
      // stage will be updated as part of the AWS::ApiGatewayV2::Deployment for the websocket
      if (provider.apiGateway && provider.apiGateway.websocketApiId) return null;

      // logs
      const logsEnabled = provider.logs && provider.logs.websocket;

      const stageLogicalId = this.provider.naming.getWebsocketsStageLogicalId();
      const logGroupLogicalId = this.provider.naming.getWebsocketsLogGroupLogicalId();

      const stageResource = {
        Type: 'AWS::ApiGatewayV2::Stage',
        Properties: {
          ApiId: this.provider.getApiGatewayWebsocketApiId(),
          DeploymentId: {
            Ref: this.websocketsDeploymentLogicalId,
          },
          StageName: this.provider.getStage(),
          Description:
            this.serverless.service.provider.websocketsDescription || 'Serverless Websockets',
        },
      };

      Object.assign(cfTemplate.Resources, { [stageLogicalId]: stageResource });

      if (!logsEnabled) return null;

      // create log-specific resources
      Object.assign(stageResource.Properties, {
        AccessLogSettings: {
          DestinationArn: {
            'Fn::Sub': `arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:\${${logGroupLogicalId}}`,
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
      });

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
  return resource;
}
