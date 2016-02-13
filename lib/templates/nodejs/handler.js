'use strict';

/**
 * Serverless Module: Lambda Handler
 * - Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent
 * - 'serverless-helpers-js' module is required for Serverless ENV var support.  Hopefully, AWS will add ENV support to Lambda soon :)
 */

var ServerlessHelpers = require('serverless-helpers-js'),
    lib;

// Require Serverless ENV vars
ServerlessHelpers.loadEnv();

// Require Logic
lib = require('<%= fnRootPath %>lib');

// Lambda Handlers
module.exports.handler = ServerlessHelpers.shimCallback(lib.respond);
