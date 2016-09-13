'use strict';
const chalk = require('chalk');
const version = require('./../../package.json').version;

module.exports.SError = class ServerlessError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    Error.captureStackTrace(this, this.constructor);
  }
};

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
      consoleLog(chalk.red('     For debugging logs, run again after setting SLS_DEBUG env var.'));
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
      consoleLog(' ');
    }

    consoleLog(chalk.yellow('  Your Enviroment Infomation -----------------------------'));
    consoleLog(chalk.yellow(`     Node Version:       ${process.version.replace(/^[v|V]/, '')}`));
    consoleLog(chalk.yellow(`     Serverless Version: ${version}`));
    consoleLog(' ');

    // Failure exit
    process.exit(1);
  } catch (errorHandlingError) {
    throw new Error(e);
  }
};
