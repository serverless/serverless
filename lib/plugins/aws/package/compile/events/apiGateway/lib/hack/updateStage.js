/* eslint-disable no-use-before-define */

'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

// NOTE --> Keep this file in sync with ../stage.js

// NOTE: This code was written since there are problem setting up dedicated CloudFormation
// Stage resource (see https://github.com/serverless/serverless/pull/5692#issuecomment-467849311 for more information).

module.exports = {
  updateStage() {
    // this array is used to gather all the patch operations we need to
    // perform on the stage
    this.apiGatewayStagePatchOperations = [];
    this.apiGatewayStageState = {};
    this.apiGatewayDeploymentId = null;
    this.apiGatewayRestApiId = null;

    return resolveAccountId.call(this)
      .then(resolveRestApiId.bind(this))
      .then(resolveStage.bind(this))
      .then(resolveDeploymentId.bind(this))
      .then(ensureStage.bind(this))
      .then(handleTracing.bind(this))
      .then(handleLogs.bind(this))
      .then(handleTags.bind(this))
      .then(applyUpdates.bind(this))
      .then(removeLogGroup.bind(this));
  },
};

function resolveAccountId() {
  // eslint-disable-next-line no-return-assign
  return this.provider.getAccountId().then((id) => this.accountId = id);
}

function resolveRestApiId() {
  return this.provider.request('APIGateway', 'getRestApis', { limit: 500 })
    .then((res) => {
      if (res.items.length) {
        const filteredRestApis = res.items.filter((api) =>
          api.name === `${this.options.stage}-${this.serverless.service.service}`);
        if (filteredRestApis.length) {
          const restApi = filteredRestApis.shift();
          return restApi.id;
        }
      }
      return null;
    })
    .then((restApiId) => {
      this.apiGatewayRestApiId = restApiId;
    });
}

function resolveStage() {
  const restApiId = this.apiGatewayRestApiId;

  return this.provider.request('APIGateway', 'getStage', {
    restApiId,
    stageName: this.options.stage,
  }).then((res) => {
    this.apiGatewayStageState = res;
  }).catch(() => {
    // fail silently...
  });
}

function resolveDeploymentId() {
  if (_.isEmpty(this.apiGatewayStageState)) {
    const restApiId = this.apiGatewayRestApiId;

    return this.provider.request('APIGateway', 'getDeployments', {
      restApiId,
      limit: 500,
    }).then(res => {
      if (res.items.length) {
        // there will ever only be 1 deployment associated
        const deployment = res.items.shift();
        return deployment.id;
      }
      return null;
    })
    .then((deploymentId) => {
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
  const tracing = this.serverless.service.provider.tracing;
  const tracingEnabled = tracing && tracing.apiGateway;

  let operation = { op: 'replace', path: '/tracingEnabled', value: 'false' };
  if (tracingEnabled) {
    operation = { op: 'replace', path: '/tracingEnabled', value: 'true' };
  }
  this.apiGatewayStagePatchOperations.push(operation);
}

function handleLogs() {
  const provider = this.serverless.service.provider;
  const logs = provider.logs && provider.logs.restApi;
  const ops = this.apiGatewayStagePatchOperations;

  let dataTrace = { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' };
  let logLevel = { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' };

  let operations = [dataTrace, logLevel];

  if (logs) {
    const service = this.serverless.service.service;
    const stage = this.options.stage;
    const region = this.options.region;
    const logGroupName = `/aws/api-gateway/${service}-${stage}`;

    const destinationArn = {
      op: 'replace',
      path: '/accessLogSettings/destinationArn',
      value: `arn:aws:logs:${region}:${this.accountId}:log-group:${logGroupName}`,
    };
    const format = {
      op: 'replace',
      path: '/accessLogSettings/format',
      value: [
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
      ].join(', '),
    };
    dataTrace = { op: 'replace', path: '/*/*/logging/dataTrace', value: 'true' };
    logLevel = { op: 'replace', path: '/*/*/logging/loglevel', value: 'INFO' };
    operations = [destinationArn, format, dataTrace, logLevel];
  }

  ops.push.apply(ops, operations); // eslint-disable-line prefer-spread
}

function handleTags() {
  const provider = this.serverless.service.provider;
  const tagsMerged = Object.assign({}, provider.stackTags, provider.tags);

  const tagsToCreate = _.entriesIn(tagsMerged).map(pair => ({
    key: String(pair[0]),
    value: String(pair[1]),
  }));
  if (tagsToCreate) {
    tagsToCreate.forEach((tag) => {
      const operation = { op: 'replace', path: `/variables/${tag.key}`, value: tag.value };
      this.apiGatewayStagePatchOperations.push(operation);
    });
  }

  if (this.apiGatewayStageState.variables) {
    const stateTagKeys = Object.keys(this.apiGatewayStageState.variables);
    const newTagKeys = Object.keys(tagsMerged);
    const tagsToRemove = _.difference(stateTagKeys, newTagKeys);
    if (tagsToRemove) {
      tagsToRemove.forEach((tagKey) => {
        const operation = { op: 'remove', path: `/variables/${tagKey}` };
        this.apiGatewayStagePatchOperations.push(operation);
      });
    }
  }
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

function removeLogGroup() {
  const service = this.serverless.service.service;
  const provider = this.serverless.service.provider;
  const stage = this.options.stage;
  const logGroupName = `/aws/api-gateway/${service}-${stage}`;

  const logs = provider.logs && provider.logs.restApi;

  // if there are no logs setup (or the user has disabled them) we need to
  // ensure that the log group is removed. Otherwise we'll run into duplicate
  // log group name issues when logs are enabled again
  if (!logs) {
    return this.provider.request('CloudWatchLogs', 'deleteLogGroup', {
      logGroupName,
    }).catch(() => {
      // fail silently...
    });
  }

  return BbPromise.resolve();
}
