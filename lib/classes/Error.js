'use strict';

const ServerlessError = require('../serverless-error');

module.exports.ServerlessError = ServerlessError;

// Deprecated - use ServerlessError instead
module.exports.SError = ServerlessError;
