'use strict';
const version = require('./../../package.json').version;
const logger = require('./Logger');

module.exports.SError = class ServerlessError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
};

module.exports.logError = (e) => {
  try {
    logger.error(`${e.name}: ${e.message}`);
    if (process.env.SLS_DEBUG) {
      logger.info(`\nStack Trace: ${e.stack}`);
    }

    if (e.name !== 'ServerlessError') {
      logger.error('\nWe think it might be a bug. ' +
        'Please report this error including following information: ' +
        `OS: ${process.platform}, ` +
        `Node Version: ${process.version.replace(/^[v|V]/, '')}, ` +
        `Serverless Version: ${version}.`);
    }

    logger.info('\nGet support from official docs (http://docs.serverless.com) ' +
      'or submit issue on GitHub (https://github.com/serverless/serverless/issues).');

    // Failure exit
    process.exit(1);
  } catch (errorHandlingError) {
    throw new Error(e);
  }
};
