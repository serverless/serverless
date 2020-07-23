'use strict';

const chalk = require('chalk');
const weakMemoizee = require('memoizee/weak');

const disabledCodesByEnv = extractCodes(process.env.SLS_DEPRECATION_DISABLE);

const loggedDeprecations = new Set();

function extractCodes(codesStr) {
  if (!codesStr) {
    return new Set();
  }
  return new Set(codesStr.split(','));
}

const resolveDeprecatedByService = weakMemoizee(serviceConfig => {
  let disabledDeprecations = [];
  if (typeof serviceConfig.disabledDeprecations === 'string') {
    disabledDeprecations = [serviceConfig.disabledDeprecations];
  } else {
    disabledDeprecations = Array.from(serviceConfig.disabledDeprecations || []);
  }
  return new Set(disabledDeprecations);
});

function writeDeprecation(code, message) {
  process.stdout.write(`Serverless: ${chalk.redBright(`Deprecation Notice: ${message}`)}\n`);
  if (!code.startsWith('EXT_')) {
    process.stdout.write(
      `            ${chalk.dim(
        `More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`
      )}\n`
    );
  }
}

module.exports = (code, message, { serviceConfig } = {}) => {
  if (loggedDeprecations.has(code) || disabledCodesByEnv.has(code) || disabledCodesByEnv.has('*')) {
    return;
  }
  if (serviceConfig) {
    const serviceDisabledCodes = resolveDeprecatedByService(serviceConfig);
    if (serviceDisabledCodes.has(code) || serviceDisabledCodes.has('*')) {
      return;
    }
  }

  loggedDeprecations.add(code);
  writeDeprecation(code, message);
};
