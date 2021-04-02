'use strict';

const chalk = require('chalk');
const ServerlessError = require('../serverless-error');

const consoleLog = (message) => {
  process.stdout.write(`${message}\n`);
};

const writeMessage = (title, message) => {
  let line = '';
  while (line.length < 56 - title.length) {
    line = `${line}-`;
  }

  consoleLog(' ');
  consoleLog(chalk.yellow(` ${title} ${line}`));
  consoleLog(' ');

  if (message) {
    consoleLog(`  ${message.split('\n').join('\n  ')}`);
  }

  consoleLog(' ');
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
