'use strict';
const chalk = require('chalk');
const memoizee = require('memoizee');

const disabledCodesByEnv = extractCodes(process.env.SLS_DEPRECATION_DISABLE);

const loggedDeprecations = new Set();

function extractCodes(codesStr) {
  if (!codesStr) {
    return new Set();
  }
  return new Set(codesStr.split(','));
}

const resolveDeprecatedByService = memoizee((serviceConfig = {}) => {
  let disabledDeprecations = [];
  if (typeof serviceConfig.disabledDeprecations === 'string') {
    disabledDeprecations = [serviceConfig.disabledDeprecations];
  } else {
    disabledDeprecations = serviceConfig.disabledDeprecations || [];
  }
  return new Set(disabledDeprecations);
});

function writeDeprecation(code, message) {
  process.stdout.write(
    [
      `Serverless: ${chalk.red(`Deprecation Warning: ${message}`)}`,
      `            ${chalk.dim(
        `More Info: https://www.serverless.com/framework/docs/deprecations/#${code}`
      )}}`,
    ].join('\n')
  );
}

function logDeprecation(code, message, { serviceConfig } = {}) {
  if (loggedDeprecations.has(code) || disabledCodesByEnv.has(code) || disabledCodesByEnv.has('*')) {
    return;
  }

  const serviceDisabledCodes = resolveDeprecatedByService(serviceConfig);
  if (serviceDisabledCodes.has(code) || serviceDisabledCodes.has('*')) {
    return;
  }

  loggedDeprecations.add(code);
  writeDeprecation(code, message);
}

module.exports = logDeprecation;
