'use strict';

const awsRequest = require('@serverless/test/aws-request');
const wait = require('timers-ext/promise/sleep');

const logger = console;

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
  const timeout = options.timeout || 60 * 1000;
  return trigger()
    .then(() => wait(1000))
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
      if (duration > timeout) throw new Error('Log items not found');
      return confirmCloudWatchLogs(
        logGroupName,
        trigger,
        Object.assign({}, options, { timeout: timeout - duration })
      );
    });
}

module.exports = {
  confirmCloudWatchLogs,
  logger,
  replaceEnv,
};
