'use strict';

/**
 * Serverless Module: Lambda Handler
 * "Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent"
 */

// Modularized Code
var code = require('./index.js');

// Lambda Handler
module.exports.handler = function(event, context) {
  code.run(event, context, function(error, result) {
    return context.done(error, result);
  });
};
