'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const ServerlessError = require('../../../../../../../../classes/Error').ServerlessError;

const isRestApiId = RegExp.prototype.test.bind(/^[a-z0-9]{3,}$/);
const defaultApiGatewayLogFormat = [
  'requestId: $context.requestId',
  'ip: $context.identity.sourceIp',
  'caller: $context.identity.caller',
  'user: $context.identity.user',
  'requestTime: $context.requestTime',
  'httpMethod: $context.httpMethod',
  'resourcePath: $context.resourcePath',
  'status: $context.status',
  'protocol: $context.protocol',
  'responseLength: $context.responseLength',
].join(', ');
const defaultApiGatewayLogLevel = 'INFO';
const apiGatewayValidLogLevels = new Set(['INFO', 'ERROR']);

// NOTE --> Keep this file in sync with ../stage.js

// NOTE: This code was written since there are problem setting up dedicated CloudFormation
// Stage resource (see https://github.com/serverless/serverless/pull/5692#issuecomment-467849311 for more information).

module.exports = {
  defaultApiGatewayLogLevel,
  apiGatewayValidLogLevels,
  updateStage() {
    // this array is used to gather all the patch operations we need to
    // perform on the stage
    this.apiGatewayStagePatchOperations = [];
    this.apiGatewayTagResourceParams = [];
    this.apiGatewayUntagResourceParams = [];
    this.apiGatewayStageState = {};
    this.apiGatewayDeploymentId = null;
    this.apiGatewayRestApiId = null;

    return resolveAccountInfo
      .call(this)
      .then(resolveRestApiId.bind(this))
      .then(() => {
        if (!this.apiGatewayRestApiId) {
          // Could not resolve REST API id automatically

          const provider = this.state.service.provider;
          const isTracingEnabled = provider.tracing && provider.tracing.apiGateway;
          const areLogsEnabled = provider.logs && provider.logs.restApi;

          if (!isTracingEnabled && !areLogsEnabled) {
            // Do crash if there are no API Gateway customizations to apply
            return null;
          }

          const errorMessage = [
            'Rest API id could not be resolved.\n',
            'This might be caused by a custom API Gateway configuration.\n\n',
            'In given setup stage specific options such as ',
            '`tracing`, `logs` and `tags` are not supported.\n\n',
            'Please update your configuration (or open up an issue if you feel ',
            "that there's a way to support your setup).",
          ].join('');

          throw new ServerlessError(errorMessage);
        }
        return resolveStage
          .call(this)
          .then(resolveDeploymentId.bind(this))
          .then(ensureStage.bind(this))
          .then(handleTracing.bind(this))
          .then(handleLogs.bind(this))
          .then(handleTags.bind(this))
          .then(applyUpdates.bind(this))
          .then(addTags.bind(this))
          .then(removeTags.bind(this))
          .then(removeAccessLoggingLogGroup.bind(this));
      });
  },
};

function resolveAccountInfo() {
  // eslint-disable-next-line no-return-assign
  return this.provider.getAccountInfo().then(account => {
    this.accountId = account.accountId;
    this.partition = account.partition;
  });
}

function resolveApiGatewayResource(resources) {
  if (resources.ApiGatewayRestApi) return resources.ApiGatewayRestApi;
  const apiGatewayResources = _.values(resources).filter(
    resource => resource.Type === 'AWS::ApiGateway::Resource'
  );
  if (apiGatewayResources.length === 1) return apiGatewayResources[0];
  // None, or more than one API Gateway found (currently there's no support for multiple APIGW's)
  return null;
}

function resolveRestApiId() {
  return new BbPromise(resolve => {
    const provider = this.state.service.provider;
    const externalRestApiId = provider.apiGateway && provider.apiGateway.restApiId;
    if (externalRestApiId) {
      resolve(isRestApiId(externalRestApiId) ? externalRestApiId : null);
      return;
    }
    const apiGatewayResource = resolveApiGatewayResource(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources
    );
    const apiName = apiGatewayResource
      ? apiGatewayResource.Properties.Name
      : provider.apiName || `${this.options.stage}-${this.state.service.service}`;
    const resolveFromAws = position =>
      this.provider.request('APIGateway', 'getRestApis', { position, limit: 500 }).then(result => {
        const restApi = result.items.find(api => api.name === apiName);
        if (restApi) return restApi.id;
        if (result.position) return resolveFromAws(result.position);
        return null;
      });
    resolve(resolveFromAws());
  }).then(restApiId => {
    this.apiGatewayRestApiId = restApiId;
  });
}

function resolveStage() {
  const restApiId = this.apiGatewayRestApiId;

  return this.provider
    .request('APIGateway', 'getStage', {
      restApiId,
      stageName: this.options.stage,
    })
    .then(res => {
      this.apiGatewayStageState = res;
    })
    .catch(() => {
      // fail silently...
    });
}

function resolveDeploymentId() {
  if (_.isEmpty(this.apiGatewayStageState)) {
    const restApiId = this.apiGatewayRestApiId;

    return this.provider
      .request('APIGateway', 'getDeployments', {
        restApiId,
        limit: 500,
      })
      .then(res => {
        if (res.items.length) {
          // there will ever only be 1 deployment associated
          const deployment = res.items.shift();
          return deployment.id;
        }
        return null;
      })
      .then(deploymentId => {
        this.apiGatewayDeploymentId = deploymentId;
      });
  }

  return BbPromise.resolve();
}

function ensureStage() {
  if (_.isEmpty(this.apiGatewayStageState)) {
    const restApiId = this.apiGatewayRestApiId;
    const deploymentId = this.apiGatewayDeploymentId;

    return this.provider.request('APIGateway', 'createStage', {
      deploymentId,
      restApiId,
      stageName: this.options.stage,
    });
  }

  return BbPromise.resolve();
}

function handleTracing() {
  const tracing = this.state.service.provider.tracing;
  const tracingEnabled = tracing && tracing.apiGateway;

  let operation = { op: 'replace', path: '/tracingEnabled', value: 'false' };
  if (tracingEnabled) {
    operation = { op: 'replace', path: '/tracingEnabled', value: 'true' };
  }
  this.apiGatewayStagePatchOperations.push(operation);
}

function handleLogs() {
  const provider = this.state.service.provider;
  const logs = provider.logs && provider.logs.restApi;
  const ops = this.apiGatewayStagePatchOperations;

  let operations = [
    { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' },
    { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' },
  ];

  if (logs) {
    const service = this.state.service.service;
    const stage = this.options.stage;
    const region = this.options.region;
    const partition = this.partition;
    const logGroupName = `/aws/api-gateway/${service}-${stage}`;

    operations = [];

    let logFormat = defaultApiGatewayLogFormat;
    if (logs.format) {
      logFormat = logs.format;
    }

    const executionLogging = logs.executionLogging == null ? true : logs.executionLogging;

    let level = defaultApiGatewayLogLevel;
    if (!executionLogging) {
      level = 'OFF';
    } else if (logs.level) {
      level = logs.level;
      if (!apiGatewayValidLogLevels.has(level)) {
        throw new ServerlessError(
          `provider.logs.restApi.level is set to an invalid value. Support values are ${Array.from(
            apiGatewayValidLogLevels
          ).join(', ')}, got ${level}.`
        );
      }
    }

    const accessLogging = logs.accessLogging == null ? true : logs.accessLogging;

    if (accessLogging) {
      const resourceArn = `arn:${partition}:logs:${region}:${this.accountId}:log-group:${logGroupName}`;
      const destinationArn = {
        op: 'replace',
        path: '/accessLogSettings/destinationArn',
        value: resourceArn,
      };
      const format = {
        op: 'replace',
        path: '/accessLogSettings/format',
        value: logFormat,
      };

      operations.push(destinationArn, format);
    } else {
      // this is required to remove any existing log setting
      operations.push({
        op: 'remove',
        path: '/accessLogSettings',
      });
    }

    const fullExecutionData = logs.fullExecutionData == null ? true : logs.fullExecutionData;
    operations.push({
      op: 'replace',
      path: '/*/*/logging/dataTrace',
      value: String(Boolean(fullExecutionData)),
    });

    operations.push({ op: 'replace', path: '/*/*/logging/loglevel', value: level });
  }

  ops.push.apply(ops, operations); // eslint-disable-line prefer-spread
}

function handleTags() {
  const provider = this.state.service.provider;
  const tagsMerged = _.mapValues(Object.assign({}, provider.stackTags, provider.tags), v =>
    String(v)
  );
  const currentTags = this.apiGatewayStageState.tags || {};
  const tagKeysToBeRemoved = Object.keys(currentTags).filter(
    currentKey => !_.isString(tagsMerged[currentKey])
  );

  const restApiId = this.apiGatewayRestApiId;
  const stageName = this.options.stage;
  const region = this.options.region;
  const partition = this.partition;
  const resourceArn = `arn:${partition}:apigateway:${region}::/restapis/${restApiId}/stages/${stageName}`;

  if (tagKeysToBeRemoved.length > 0) {
    this.apiGatewayUntagResourceParams.push({
      resourceArn,
      tagKeys: tagKeysToBeRemoved,
    });
  }
  if (!_.isEqual(currentTags, tagsMerged) && _.size(tagsMerged) > 0) {
    this.apiGatewayTagResourceParams.push({
      resourceArn,
      tags: tagsMerged,
    });
  }
}

function addTags() {
  const requests = this.apiGatewayTagResourceParams.map(tagResourceParam =>
    this.provider.request('APIGateway', 'tagResource', tagResourceParam)
  );
  return BbPromise.all(requests);
}

function removeTags() {
  const requests = this.apiGatewayUntagResourceParams.map(untagResourceParam =>
    this.provider.request('APIGateway', 'untagResource', untagResourceParam)
  );
  return BbPromise.all(requests);
}

function applyUpdates() {
  const restApiId = this.apiGatewayRestApiId;
  const patchOperations = this.apiGatewayStagePatchOperations;

  if (patchOperations.length) {
    return this.provider.request('APIGateway', 'updateStage', {
      restApiId,
      stageName: this.options.stage,
      patchOperations,
    });
  }

  return BbPromise.resolve();
}

function removeAccessLoggingLogGroup() {
  const service = this.state.service.service;
  const provider = this.state.service.provider;
  const stage = this.options.stage;
  const logGroupName = `/aws/api-gateway/${service}-${stage}`;

  let accessLogging = provider.logs && provider.logs.restApi;

  if (accessLogging) {
    accessLogging = accessLogging.accessLogging == null ? true : accessLogging.accessLogging;
  }

  // if there are no logs setup (or the user has disabled them) we need to
  // ensure that the log group is removed. Otherwise we'll run into duplicate
  // log group name issues when logs are enabled again
  if (!accessLogging) {
    return this.provider
      .request('CloudWatchLogs', 'deleteLogGroup', {
        logGroupName,
      })
      .catch(() => {
        // fail silently...
      });
  }

  return BbPromise.resolve();
}
