/* eslint-disable no-use-before-define */
/* eslint-disable max-len */

'use strict';

// NOTE: --> Keep this file in sync with ./hack/updateStage.js

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileStage() {
    const service = this.serverless.service.service;
    const stage = this.options.stage;
    const provider = this.serverless.service.provider;
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;

    // logs
    const logs = provider.logs && provider.logs.restApi;

    // TracingEnabled
    const tracing = provider.tracing;
    const TracingEnabled = !_.isEmpty(tracing) && tracing.apiGateway;

    // Tags
    const tagsMerged = Object.assign({}, provider.stackTags, provider.tags);
    const Tags = _.entriesIn(tagsMerged).map(pair => ({
      Key: pair[0],
      Value: pair[1],
    }));

    // NOTE: the DeploymentId is random, therefore we rely on prior usage here
    // --- currently commented out since this is done via the SDK in updateStage.js ---
    // const deploymentId = this.apiGatewayDeploymentLogicalId;
    // --------------------------------------------------------------------------------
    const logGroupLogicalId = this.provider.naming
      .getApiGatewayLogGroupLogicalId();
    const logsRoleLogicalId = this.provider.naming
      .getApiGatewayLogsRoleLogicalId();
    const accountLogicalid = this.provider.naming
      .getApiGatewayAccountLogicalId();

    this.apiGatewayStageLogicalId = this.provider.naming
      .getStageLogicalId();

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
      if (logs) {
        // --- currently commented out since this is done via the SDK in updateStage.js ---
        // _.merge(stageResource.Properties, {
        //   AccessLogSetting: {
        //     DestinationArn: {
        //       'Fn::GetAtt': [
        //         logGroupLogicalId,
        //         'Arn',
        //       ],
        //     },
        //     // eslint-disable-next-line
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
          [logGroupLogicalId]: getLogGroupResource(service, stage),
          [logsRoleLogicalId]: getIamRoleResource(service, stage),
          [accountLogicalid]: getAccountResource(logsRoleLogicalId),
        });
      }

      // --- currently commented out since this is done via the SDK in updateStage.js ---
      // _.merge(cfTemplate.Resources, { [this.apiGatewayStageLogicalId]: stageResource });

      // we need to remove the stage name from the Deployment resource
      // delete cfTemplate.Resources[deploymentId].Properties.StageName;
      // --------------------------------------------------------------------------------
    }

    return BbPromise.resolve();
  },
};

function getLogGroupResource(service, stage) {
  return ({
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: `/aws/api-gateway/${service}-${stage}`,
    },
  });
}

function getIamRoleResource(service, stage) {
  return ({
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: [
                'apigateway.amazonaws.com',
              ],
            },
            Action: [
              'sts:AssumeRole',
            ],
          },
        ],
      },
      ManagedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs',
      ],
      Path: '/',
      RoleName: {
        'Fn::Join': [
          '-',
          [
            service,
            stage,
            {
              Ref: 'AWS::Region',
            },
            'apiGatewayLogsRole',
          ],
        ],
      },
    },
  });
}

function getAccountResource(logsRoleLogicalId) {
  return ({
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
}
