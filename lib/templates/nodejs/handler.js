'use strict';

/**
 * Serverless Module: Lambda Handler
 * - Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent
 * - 'dotenv' module is required for Serverless ENV var support.  Hopefully, AWS will add ENV support to Lambda soon :)
 */

// Require Serverless ENV vars
require('serverless-helpers-js');

// Require Logic
var controller = require('../lib');

// Lambda Handler
module.exports.handler = function(event, context) {

  controller.handler(event, function(error, response) {
    return context.done(error, response);
  });

};