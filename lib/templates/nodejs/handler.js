'use strict';

/**
 * AWS Module: Action: Lambda Handler
 * "Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent"
 */

require('../../jaws-core-js/env');

// Modularized Code
var action = require('./index.js');

// Lambda Handler
module.exports.handler = function(event, context) {
  action.run(event, context, function(error, result) {
    return context.done(error, result);
  });
};
