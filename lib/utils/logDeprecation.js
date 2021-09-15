'use strict';

const chalk = require('chalk');
const weakMemoizee = require('memoizee/weak');
const _ = require('lodash');
const ServerlessError = require('../serverless-error');
const { style, legacy, log } = require('@serverless/utils/log');

const disabledDeprecationCodesByEnv = extractCodes(process.env.SLS_DEPRECATION_DISABLE);

const notificationModeByEnv = process.env.SLS_DEPRECATION_NOTIFICATION_MODE;

const triggeredDeprecations = new Set();
const bufferedDeprecations = [];

const deprecationLogger = log.get('deprecation');

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

const resolveMode = (serviceConfig) => {
  switch (notificationModeByEnv) {
    case 'error':
    case 'warn':
      return notificationModeByEnv;
    default:
  }
  const modeByConfig = _.get(serviceConfig, 'deprecationNotificationMode');
  switch (modeByConfig) {
    case 'error':
    case 'warn':
      return modeByConfig;
    default:
      return module.exports.defaultMode;
  }
};

function writeDeprecation(code, message) {
  const prefix = 'Serverless: ';
  const messageLines = message.split('\n');
  const followingLinesPrefix = ' '.repeat(prefix.length);
  for (let i = 1; i < messageLines.length; ++i) {
    messageLines[i] = followingLinesPrefix + messageLines[i];
  }
  message = messageLines.join('\n');
  legacy.write(`Serverless: ${chalk.keyword('orange')(`Deprecation warning: ${message}`)}\n`);
  if (!code.startsWith('EXT_')) {
    legacy.write(
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

    switch (resolveMode(serviceConfig)) {
      case 'error':
        throw new ServerlessError(
          `${message}\n  More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`,
          `REJECTED_DEPRECATION_${code}`
        );
      case 'warn':
        writeDeprecation(code, message);
        return;
      default:
        bufferedDeprecations.push({ message, code });
    }
  } finally {
    triggeredDeprecations.add(code);
  }
};

module.exports.triggeredDeprecations = triggeredDeprecations;
module.exports.defaultMode = 'warn:summary';

module.exports.flushBuffered = () => {
  try {
    for (const { code, message } of bufferedDeprecations) writeDeprecation(code, message);
  } finally {
    bufferedDeprecations.length = 0;
  }
};

module.exports.printSummary = () => {
  if (!bufferedDeprecations.length) return;

  deprecationLogger.warning();

  try {
    if (bufferedDeprecations.length === 1) {
      deprecationLogger.warning(
        style.aside("1 deprecation found: run 'serverless doctor' for more details")
      );
      const { code, message } = bufferedDeprecations[0];
      writeDeprecation(code, message);
      return;
    }

    deprecationLogger.warning(
      style.aside(
        `${bufferedDeprecations.length} deprecations found: run 'serverless doctor' for more details`
      )
    );

    const prefix = 'Serverless: ';
    legacy.write(`${prefix}${chalk.bold.keyword('orange')('Deprecation warnings:')}\n\n`);
    for (const { code, message } of bufferedDeprecations) {
      const messageLines = chalk.bold(message).split('\n');
      if (!code.startsWith('EXT_')) {
        messageLines.push(
          `More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`
        );
      }

      legacy.write(chalk.keyword('orange')(`${messageLines.join('\n')}\n\n`));
    }
  } finally {
    bufferedDeprecations.length = 0;
  }
};
