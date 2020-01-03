'use strict';

const _ = require('lodash');
const AWS = require('aws-sdk');
const awsLog = require('log').get('aws');

const logger = console;

const getServiceInstance = _.memoize(name => {
  const Service = _.get(AWS, name);
  return new Service({ region: 'us-east-1' });
});

let lastAwsRequestId = 0;
function awsRequest(service, method, ...args) {
  const requestId = ++lastAwsRequestId;
  awsLog.debug('[%d] %o %s %O', requestId, service, method, args);
  const instance = (() => {
    if (!_.isObject(service)) return getServiceInstance(service);
    const Service = _.get(AWS, service.name);
    return new Service(Object.assign({ region: 'us-east-1' }, service.params));
  })();
  return instance[method](...args)
    .promise()
    .then(
      result => {
        awsLog.debug('[%d] %O', requestId, result);
        return result;
      },
      error => {
        awsLog.debug('[%d] %O', requestId, error);
        if (error.statusCode !== 403 && error.retryable) {
          awsLog.debug('[%d] retry', requestId);
          return wait(4000 + Math.random() * 3000).then(() => awsRequest(service, method, ...args));
        }
        throw error;
      }
    );
}

const testServiceIdentifier = 'integ-test';

const serviceNameRegex = new RegExp(`${testServiceIdentifier}-d+`);

function getServiceName() {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${hrtime[1]}`;
}

function replaceEnv(values) {
  const originals = {};
  for (const key of Object.keys(values)) {
    if (process.env[key]) {
      originals[key] = process.env[key];
    } else {
      originals[key] = 'undefined';
    }
    if (values[key] === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  return originals;
}

/**
 * Cloudwatch logs when turned on, are usually take some time for being effective
 * This function allows to confirm that new setting (turned on cloudwatch logs)
 * is effective after stack deployment
 */
function confirmCloudWatchLogs(logGroupName, trigger, options = {}) {
  const startTime = Date.now();
  const timeout = options.timeout || 60000;
  return trigger()
    .then(() => awsRequest('CloudWatchLogs', 'filterLogEvents', { logGroupName }))
    .then(result => {
      if (result.events.length) return result.events;
      const duration = Date.now() - startTime;
      if (duration > timeout) return [];
      return confirmCloudWatchLogs(logGroupName, trigger, { timeout: timeout - duration });
    });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  awsRequest,
  confirmCloudWatchLogs,
  getServiceName,
  logger,
  replaceEnv,
  serviceNameRegex,
  testServiceIdentifier,
  wait,
};
