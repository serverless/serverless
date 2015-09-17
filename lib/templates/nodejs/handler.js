'use strict';

/**
 * AWS Module: Action: Lambda Handler
 * "Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent"
 */

//TODO: remove this line into jaws-common aws module
require('dotenv').config({path: path.join(eval('__dirname'), '..', '..', '..', '.env'), silent: true});

// Modularized Code
var action = require('./index.js');

// Lambda Handler
module.exports.handler = function(event, context) {
  action.run(event, context, function(error, result) {
    return context.done(error, result);
  });
};
