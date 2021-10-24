'use strict';

const chalk = require('chalk');
const ServerlessError = require('../serverless-error');
const { legacy } = require('@serverless/utils/log');

const writeMessage = (title, message) => {
  let line = '';
  while (line.length < 56 - title.length) {
    line = `${line}-`;
  }

  legacy.consoleLog(' ');
  legacy.consoleLog(chalk.yellow(` ${title} ${line}`));
  legacy.consoleLog(' ');

  if (message) {
    legacy.consoleLog(`  ${message.split('\n').join('\n  ')}`);
  }

  legacy.consoleLog(' ');
};

module.exports.ServerlessError = ServerlessError;

// Deprecated - use ServerlessError instead
module.exports.SError = ServerlessError;

module.exports.logWarning = (message) => {
  if (process.env.SLS_WARNING_DISABLE) {
    return;
  }

  writeMessage('Serverless Warning', message);
};

module.exports.logInfo = (message) => {
  writeMessage('Serverless Information', message);
};
