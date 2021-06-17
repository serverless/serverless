'use strict';

const chalk = require('chalk');
const weakMemoizee = require('memoizee/weak');
const _ = require('lodash');
const ServerlessError = require('../serverless-error');

const disabledDeprecationCodesByEnv = extractCodes(process.env.SLS_DEPRECATION_DISABLE);

const notificationModeByEnv = process.env.SLS_DEPRECATION_NOTIFICATION_MODE;

const triggeredDeprecations = new Set();

function extractCodes(codesStr) {
  if (!codesStr) {
    return new Set();
  }
  return new Set(codesStr.split(','));
}

const resolveDisabledDeprecationsByService = weakMemoizee((serviceConfig) => {
  let disabledDeprecations = [];
  if (typeof serviceConfig.disabledDeprecations === 'string') {
    disabledDeprecations = [serviceConfig.disabledDeprecations];
  } else {
    disabledDeprecations = Array.from(serviceConfig.disabledDeprecations || []);
  }
  return new Set(disabledDeprecations);
});

const isErrorNotificationMode = (serviceConfig) => {
  if (notificationModeByEnv) return notificationModeByEnv === 'error';
  return _.get(serviceConfig, 'deprecationNotificationMode') === 'error';
};

function writeDeprecation(code, message) {
  const prefix = 'Serverless: ';
  const messageLines = message.split('\n');
  const followingLinesPrefix = ' '.repeat(prefix.length);
  for (let i = 1; i < messageLines.length; ++i) {
    messageLines[i] = followingLinesPrefix + messageLines[i];
  }
  message = messageLines.join('\n');
  process.stdout.write(
    `Serverless: ${chalk.keyword('orange')(`Deprecation warning: ${message}`)}\n`
  );
  if (!code.startsWith('EXT_')) {
    process.stdout.write(
      `            ${chalk.keyword('orange')(
        `More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`
      )}\n`
    );
  }
}

module.exports = (code, message, { serviceConfig } = {}) => {
  try {
    if (
      triggeredDeprecations.has(code) ||
      disabledDeprecationCodesByEnv.has(code) ||
      disabledDeprecationCodesByEnv.has('*')
    ) {
      return;
    }

    if (serviceConfig) {
      const serviceDisabledCodes = resolveDisabledDeprecationsByService(serviceConfig);
      if (serviceDisabledCodes.has(code) || serviceDisabledCodes.has('*')) {
        return;
      }
    }

    if (isErrorNotificationMode(serviceConfig)) {
      throw new ServerlessError(
        `${message}\n  More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`,
        `REJECTED_DEPRECATION_${code}`
      );
    }

    writeDeprecation(code, message);
  } finally {
    triggeredDeprecations.add(code);
  }
};

module.exports.triggeredDeprecations = triggeredDeprecations;
