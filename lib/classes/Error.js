'use strict';

const chalk = require('chalk');
const { inspect } = require('util');
const { isError } = require('lodash');
const slsVersion = require('./../../package').version;
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const sfeVersion = require('@serverless/enterprise-plugin/package.json').version;
const { sdkVersion } = require('@serverless/enterprise-plugin');
// raven implementation examples https://www.npmjs.com/browse/depended/raven
const errorReporter = require('../utils/sentry').raven;

const consoleLog = message => {
  console.log(message); // eslint-disable-line no-console
};

const resolveExceptionMeta = exception => {
  if (isError(exception)) {
    return {
      name: exception.name,
      title: exception.name.replace(/([A-Z])/g, ' $1'),
      stack: exception.stack,
      message: exception.message,
    };
  }
  return {
    title: 'Exception',
    message: inspect(exception),
  };
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
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
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

const userErrorNames = new Set(['ServerlessError', 'YAMLException']);

module.exports.logError = (exception, { forceExit = false } = {}) => {
  const exceptionMeta = resolveExceptionMeta(exception);
  const isUserError = userErrorNames.has(exceptionMeta.name);

  const possiblyExit = () => {
    if (forceExit) process.exit();
  };

  writeMessage(
    exceptionMeta.title,
    exceptionMeta.stack && (!isUserError || process.env.SLS_DEBUG)
      ? exceptionMeta.stack
      : exceptionMeta.message
  );

  if (!isUserError && !process.env.SLS_DEBUG) {
    const debugInfo = [
      '    ',
      ' For debugging logs, run again after setting the',
      ' "SLS_DEBUG=*" environment variable.',
    ].join('');
    consoleLog(chalk.red(debugInfo));
    consoleLog(' ');
  }

  const platform = process.platform;
  const nodeVersion = process.version.replace(/^[v|V]/, '');

  consoleLog(chalk.yellow('  Get Support --------------------------------------------'));
  consoleLog(`${chalk.yellow('     Docs:          ')}${'docs.serverless.com'}`);
  consoleLog(`${chalk.yellow('     Bugs:          ')}${'github.com/serverless/serverless/issues'}`);
  consoleLog(`${chalk.yellow('     Issues:        ')}${'forum.serverless.com'}`);

  consoleLog(' ');
  consoleLog(chalk.yellow('  Your Environment Information ---------------------------'));
  consoleLog(chalk.yellow(`     Operating System:          ${platform}`));
  consoleLog(chalk.yellow(`     Node Version:              ${nodeVersion}`));
  consoleLog(
    chalk.yellow(
      `     Framework Version:         ${slsVersion}${
        isStandaloneExecutable ? ' (standalone)' : ''
      }`
    )
  );
  consoleLog(chalk.yellow(`     Plugin Version:            ${sfeVersion}`));
  consoleLog(chalk.yellow(`     SDK Version:               ${sdkVersion}`));

  // only show components version if user is running Node 8+
  const userNodeVersion = Number(process.version.split('.')[0].slice(1));
  if (userNodeVersion >= 8) {
    const { cliVersion, coreVersion } = require('@serverless/cli');
    consoleLog(chalk.yellow(`     Components Core Version:   ${coreVersion}`));
    consoleLog(chalk.yellow(`     Components CLI Version:    ${cliVersion}`));
  }
  consoleLog(' ');

  process.exitCode = 1;
  // Exit early for users who have opted out of tracking
  if (!errorReporter.installed) {
    possiblyExit();
    return;
  }
  // report error to sentry.
  errorReporter.captureException(exception, possiblyExit);
};

module.exports.logWarning = message => {
  if (process.env.SLS_WARNING_DISABLE) {
    return;
  }

  writeMessage('Serverless Warning', message);
};

module.exports.logInfo = message => {
  writeMessage('Serverless Information', message);
};
