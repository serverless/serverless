'use strict';

const BbPromise = require('bluebird');
const CloudWatchLogsSdk = require('aws-sdk/clients/cloudwatchlogs');

const logger = console;

const region = 'us-east-1';
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
  logger,
  region,
  confirmCloudWatchLogs,
  testServiceIdentifier,
  serviceNameRegex,
  getServiceName,
  replaceEnv,
  persistentRequest,
  wait,
};
