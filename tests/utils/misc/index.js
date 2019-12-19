'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');
const CloudWatchLogsSdk = require('aws-sdk/clients/cloudwatchlogs');
const awsLog = require('log').get('aws');

const logger = console;

const region = 'us-east-1';

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

const cloudWatchLogsSdk = new CloudWatchLogsSdk({ region });

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
function confirmCloudWatchLogs(logGroupName, trigger, timeout = 60000) {
  const startTime = Date.now();
  return trigger()
    .then(() => cloudWatchLogsSdk.filterLogEvents({ logGroupName }).promise())
    .then(result => {
      if (result.events.length) return result.events;
      const duration = Date.now() - startTime;
      if (duration > timeout) return [];
      return confirmCloudWatchLogs(logGroupName, trigger, timeout - duration);
    });
}

function persistentRequest(...args) {
  const func = args[0];
  const funcArgs = args.slice(1);
  const MAX_TRIES = 5;
  return new BbPromise((resolve, reject) => {
    const doCall = numTry => {
      return func.apply(this, funcArgs).then(resolve, e => {
        if (
          numTry < MAX_TRIES &&
          ((e.providerError && e.providerError.retryable) || e.statusCode === 429)
        ) {
          logger.log(
            [
              `Recoverable error occurred (${e.message}), sleeping for 5 seconds.`,
              `Try ${numTry + 1} of ${MAX_TRIES}`,
            ].join(' ')
          );
          setTimeout(doCall, 5000, numTry + 1);
        } else {
          reject(e);
        }
      });
    };
    return doCall(0);
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
  persistentRequest,
  region,
  replaceEnv,
  serviceNameRegex,
  testServiceIdentifier,
  wait,
};
