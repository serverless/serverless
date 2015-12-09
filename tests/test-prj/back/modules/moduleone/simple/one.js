'use strict';

// Load ENV
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();

// Lambda Handler
module.exports.one = function(event, context) {
  return context.done(null, { message: '"Simple One - One" lambda function has run successfully' });
};

// Lambda Handler
module.exports.two = function(event, context) {
  return context.done(null, { message: '"Simple One - Two" lambda function has run successfully' });
};