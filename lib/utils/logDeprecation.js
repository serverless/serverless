'use strict';
const chalk = require('chalk');
const memoizee = require('memoizee');

const loggedDeprecations = {};

function consoleLog(...args) {
  console.log(...args); // eslint-disable-line no-console
}

function extractCodes(codesStr) {
  if (!codesStr) {
    return [];
  }
  return codesStr.split(',').reduce((acc, code) => {
    acc[code] = true;
    return acc;
  }, {});
}

const prepareCodes = memoizee((serviceConfigCodesStr, envCodesStr) => {
  const serviceConfigCodes = extractCodes(serviceConfigCodesStr);
  const envCodes = extractCodes(envCodesStr);
  const disabledCodes = Object.assign({}, envCodes, serviceConfigCodes);
  return disabledCodes;
});

function writeDeprecation(message, docURL) {
  consoleLog(`${chalk.red(message)}\n${chalk.dim(`More Info: ${docURL}`)}`);
}

function logDeprecation(code, message, docURL, serviceConfig) {
  const disabledCodes = prepareCodes(
    serviceConfig && serviceConfig.disabledCodes,
    process.env.SLS_DEPRECATION_DISABLE
  );
  if (loggedDeprecations[code] || disabledCodes[code] || disabledCodes['*']) {
    return;
  }
  loggedDeprecations[code] = true;
  writeDeprecation(message, docURL);
}

module.exports = logDeprecation;
