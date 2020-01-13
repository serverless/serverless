'use strict';

const awsRequest = require('@serverless/test/aws-request');

const logger = console;

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
    .then(({ events }) => {
      if (events.length) {
        if (options.checkIsComplete) {
          if (options.checkIsComplete(events)) return events;
        } else {
          return events;
        }
      }
      const duration = Date.now() - startTime;
      if (duration > timeout) return [];
      return confirmCloudWatchLogs(
        logGroupName,
        trigger,
        Object.assign({}, options, { timeout: timeout - duration })
      );
    });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  confirmCloudWatchLogs,
  getServiceName,
  logger,
  replaceEnv,
  serviceNameRegex,
  testServiceIdentifier,
  wait,
};
