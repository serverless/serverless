'use strict';

/* eslint-disable max-len */

// NOTE: --> Keep this file in sync with ./hack/updateStage.js

const _ = require('lodash');
const ensureApiGatewayCloudWatchRole = require('../../lib/ensure-api-gateway-cloud-watch-role');

module.exports = {
  async compileStage() {
    const service = this.serverless.service.service;
    const stage = this.options.stage;
    const provider = this.serverless.service.provider;
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    // logs
    const logs = provider.logs && provider.logs.restApi;

    // TracingEnabled
    const tracing = provider.tracing;
    const TracingEnabled = Boolean(tracing && tracing.apiGateway);

    // Tags
    const tagsMerged = Object.assign({}, provider.stackTags, provider.tags);
    const Tags = Object.entries(tagsMerged).map((pair) => ({
      Key: pair[0],
      Value: pair[1],
    }));

    // NOTE: the DeploymentId is random, therefore we rely on prior usage here
    // --- currently commented out since this is done via the SDK in updateStage.js ---
    // const deploymentId = this.apiGatewayDeploymentLogicalId;
    // --------------------------------------------------------------------------------
    const logGroupLogicalId = this.provider.naming.getApiGatewayLogGroupLogicalId();

    this.apiGatewayStageLogicalId = this.provider.naming.getStageLogicalId();

    // NOTE: right now we're only using a dedicated Stage resource
    // - if AWS X-Ray tracing is enabled
    // - if Tags are provided
    // - if logs are enabled
    // We'll change this in the future so that users can
    // opt-in for other features as well
    if (logs || TracingEnabled || Tags.length > 0) {
      // --- currently commented out since this is done via the SDK in updateStage.js ---
      // const stageResource = {
      //   Type: 'AWS::ApiGateway::Stage',
      //   Properties: {
      //     DeploymentId: {
      //       Ref: deploymentId,
      //     },
      //     RestApiId: this.provider.getApiGatewayRestApiId(),
      //     StageName: this.provider.getStage(),
      //     TracingEnabled,
      //     Tags,
      //   },
      // };
      // --------------------------------------------------------------------------------

      // create log-specific resources
      if (logs && (logs.accessLogging == null || logs.accessLogging)) {
        // --- currently commented out since this is done via the SDK in updateStage.js ---
        // _.merge(stageResource.Properties, {
        //   AccessLogSetting: {
        //     DestinationArn: {
        //       'Fn::GetAtt': [
        //         logGroupLogicalId,
        //         'Arn',
        //       ],
        //     },
        //     Format: 'requestId: $context.requestId, ip: $context.identity.sourceIp, caller: $context.identity.caller, user: $context.identity.user, requestTime: $context.requestTime, httpMethod: $context.httpMethod, resourcePath: $context.resourcePath, status: $context.status, protocol: $context.protocol, responseLength: $context.responseLength',
        //   },
        //   MethodSettings: [
        //     {
        //       DataTraceEnabled: true,
        //       HttpMethod: '*',
        //       ResourcePath: '/*',
        //       LoggingLevel: 'INFO',
        //     },
        //   ],
        // });
        // --------------------------------------------------------------------------------

        _.merge(cfTemplate.Resources, {
          [logGroupLogicalId]: getLogGroupResource(service, stage, this.provider),
        });

        return ensureApiGatewayCloudWatchRole(this.provider);
      }

      // --- currently commented out since this is done via the SDK in updateStage.js ---
      // _.merge(cfTemplate.Resources, { [this.apiGatewayStageLogicalId]: stageResource });

      // we need to remove the stage name from the Deployment resource
      // delete cfTemplate.Resources[deploymentId].Properties.StageName;
      // --------------------------------------------------------------------------------
    }
    return Promise.resolve();
  },
};

function getLogGroupResource(service, stage, provider) {
  const resource = {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: `/aws/api-gateway/${service}-${stage}`,
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
