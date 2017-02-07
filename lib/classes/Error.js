'use strict';
const chalk = require('chalk');
const version = require('./../../package.json').version;

module.exports.ServerlessError = class ServerlessError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
};

// Deprecated - use ServerlessError instead
module.exports.SError = module.exports.ServerlessError;

module.exports.logError = (e) => {
  try {
    const words = e.message.split(' ');

    const consoleLog = (message) => {
      console.log(message); // eslint-disable-line no-console
    };

    const errorType = e.name.replace(/([A-Z])/g, ' $1');
    let line = '';
    while (line.length < 56 - errorType.length) {
      line = `${line}-`;
    }

    consoleLog(' ');
    consoleLog(chalk.yellow(` ${errorType} ${line}`));
    consoleLog(' ');


    let logLine = [];
    words.forEach(word => {
      logLine.push(word);
      const logLineString = logLine.join(' ');
      if (logLineString.length > 50) {
        consoleLog(chalk.yellow(`     ${logLineString}`));
        logLine = [];
      }
    });

    if (logLine.length !== 0) {
      consoleLog(chalk.yellow(`     ${logLine.join(' ')}`));
    }

    consoleLog(' ');

    if (e.name !== 'ServerlessError') {
      const errorMessage = [
        '    ',
        ' For debugging logs, run again after setting the',
        ' "SLS_DEBUG=*" environment variable.',
      ].join('');
      consoleLog(chalk.red(errorMessage));
      consoleLog(' ');
    }

    if (process.env.SLS_DEBUG) {
      consoleLog(chalk.yellow('  Stack Trace --------------------------------------------'));
      consoleLog(' ');
      consoleLog(e.stack);
      consoleLog(' ');
    }

    consoleLog(chalk.yellow('  Get Support --------------------------------------------'));
    consoleLog(`${chalk.yellow('     Docs:          ')}${chalk.white('docs.serverless.com')}`);
    consoleLog(`${chalk.yellow('     Bugs:          ')}${chalk
      .white('github.com/serverless/serverless/issues')}`);

    if (e.name !== 'ServerlessError') {
      consoleLog(' ');
      consoleLog(chalk.red('     Please report this error. We think it might be a bug.'));
    }

    consoleLog(' ');
    consoleLog(chalk.yellow('  Your Environment Information -----------------------------'));
    consoleLog(chalk.yellow(`     OS:                 ${process.platform}`));
    consoleLog(chalk.yellow(`     Node Version:       ${process.version.replace(/^[v|V]/, '')}`));
    consoleLog(chalk.yellow(`     Serverless Version: ${version}`));
    consoleLog(' ');

    // Failure exit
    process.exit(1);
  } catch (errorHandlingError) {
    throw new Error(e);
  }
};
