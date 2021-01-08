'use strict';

const chalk = require('chalk');

const consoleLog = (message) => {
  console.log(message); // eslint-disable-line no-console
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

class ServerlessError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    Error.captureStackTrace(this, this.constructor); // Not needed in Node.js v8+
  }
}
Object.defineProperty(ServerlessError.prototype, 'name', {
  value: ServerlessError.name,
  configurable: true,
  writable: true,
});

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
