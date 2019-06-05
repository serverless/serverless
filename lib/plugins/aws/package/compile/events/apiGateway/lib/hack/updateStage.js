'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

const isRestApiId = RegExp.prototype.test.bind(/^[a-z0-9]{3,}$/);

// NOTE --> Keep this file in sync with ../stage.js

// NOTE: This code was written since there are problem setting up dedicated CloudFormation
// Stage resource (see https://github.com/serverless/serverless/pull/5692#issuecomment-467849311 for more information).

module.exports = {
  updateStage() {
    // this array is used to gather all the patch operations we need to
    // perform on the stage
    this.apiGatewayStagePatchOperations = [];
    this.apiGatewayTagResourceParams = [];
    this.apiGatewayUntagResourceParams = [];
    this.apiGatewayStageState = {};
    this.apiGatewayDeploymentId = null;
    this.apiGatewayRestApiId = null;

    return resolveAccountId.call(this)
      .then(resolveRestApiId.bind(this))
      .then(() => {
        if (!this.apiGatewayRestApiId) {
          // Could not resolve REST API id automatically

          const provider = this.state.service.provider;
          const isTracingEnabled = provider.tracing && provider.tracing.apiGateway;
          const areLogsEnabled = provider.logs && provider.logs.restApi;
          const hasTags = Boolean(provider.tags);

          if (!isTracingEnabled && !areLogsEnabled && !hasTags) {
            // Do crash if there are no API Gateway customizations to apply
            return null;
          }

          const errorMessage = [
            'Rest API could not be resolved. ',
            'This might be casued by a custom API Gateway setup. ',
            'With you current setup stage specific configurations such as ',
            '`tracing`, `logs` and `tags` are not supported',
            '',
            'Please update your configuration or open up an issue if you feel ',
            'that there\'s a way to support your setup.',
          ].join('');

          throw new Error(errorMessage);
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
          .then(removeLogGroup.bind(this));
      });
  },
};

function resolveAccountId() {
  // eslint-disable-next-line no-return-assign
  return this.provider.getAccountId().then((id) => this.accountId = id);
}

function resolveRestApiId() {
  return new BbPromise(resolve => {
    const provider = this.state.service.provider;
    const customRestApiId = provider.apiGateway && provider.apiGateway.restApiId;
    if (customRestApiId) {
      resolve(isRestApiId(customRestApiId) ? customRestApiId : null);
      return;
    }
    const apiName = provider.apiName || `${this.options.stage}-${this.state.service.service}`;
    const resolvefromAws = position =>
      this.provider.request('APIGateway', 'getRestApis', { position, limit: 500 }).then(result => {
        const restApi = result.items.find(api => api.name === apiName);
        if (restApi) return restApi.id;
        if (result.position) return resolvefromAws(result.position);
        return null;
      });
    resolve(resolvefromAws());
  }).then(restApiId => {
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

  let dataTrace = { op: 'replace', path: '/*/*/logging/dataTrace', value: 'false' };
  let logLevel = { op: 'replace', path: '/*/*/logging/loglevel', value: 'OFF' };

  let operations = [dataTrace, logLevel];

  if (logs) {
    const service = this.state.service.service;
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
  const provider = this.state.service.provider;
  const tagsMerged = _.mapValues(Object.assign({}, provider.stackTags, provider.tags),
      v => String(v));
  const currentTags = this.apiGatewayStageState.tags || {};
  const tagKeysToBeRemoved = Object.keys(currentTags)
    .filter(currentKey => !_.isString(tagsMerged[currentKey]));

  const restApiId = this.apiGatewayRestApiId;
  const stageName = this.options.stage;
  const region = this.options.region;
  const resourceArn = `arn:aws:apigateway:${region}::/restapis/${restApiId}/stages/${stageName}`;

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
    this.provider.request('APIGateway', 'tagResource', tagResourceParam));
  return BbPromise.all(requests);
}

function removeTags() {
  const requests = this.apiGatewayUntagResourceParams.map(untagResourceParam =>
    this.provider.request('APIGateway', 'untagResource', untagResourceParam));
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

function removeLogGroup() {
  const service = this.state.service.service;
  const provider = this.state.service.provider;
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
