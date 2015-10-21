'use strict';

/**
 * AWS Module: Action: Lambda Handler
 * "Your lambda functions should be a thin wrapper around your own separate
 * modules, to keep your code testable, reusable and AWS independent"
 */

require('jaws-core-js/env');

// Modularized Code
var action = require('./index.js');
var validate = require('jsonschema').validate;
var RequestModel = require('./awsm.json').apiGateway.cloudFormation.RequestModel || {};

// Lambda Handler
module.exports.handler = function(event, context) {
  var validation = validate( event, RequestModel );

  if( validation.errors.length ){
    console.log('Event does not match RequestModel');
    console.log('Event:', JSON.stringify(event, null, '  '));
    console.log('Model:', JSON.stringify( RequestModel, null, '  '));
    console.log('Validation:', JSON.stringify( validation, null, '  '));
    return context.done('400');
  }

  action.run(event, context, function(error, result) {
    return context.done(error, result);
  });
};
