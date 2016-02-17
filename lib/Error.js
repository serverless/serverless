'use strict';

/**
 * Serverless Error
 *
 * Ex:
 * SError = require('./ServerlessError');
 * throw new SError('OOPS', SError.errorCodes.UNKNOWN);
 */

let ServerlessError = class ServerlessError extends Error {
  constructor(message, messageId) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.messageId = messageId;
    Error.captureStackTrace(this, this.constructor.name);
  }
};

module.exports = ServerlessError;

module.exports.errorCodes = {
  UNKNOWN: 1,
  MISSING_HOMEDIR: 2,
  MISSING_AWS_CREDS_PROFILE: 3,
  MISSING_AWS_CREDS: 4,
  INVALID_PROJ_NAME: 5,
  ZIP_TOO_BIG: 6,
  INVALID_PROJECT_SERVERLESS: 7,
  NO_LAMBDAS_TAGGED_DEPLOYABLE: 8,
  ACCESS_DENIED: 9,
  ENV_KEY_NOT_SET: 10,
  INVALID_RESOURCE_NAME: 11,
  NOT_IN_SERVERLESS_PROJECT: 12,
};
