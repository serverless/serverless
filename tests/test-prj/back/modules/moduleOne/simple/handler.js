'use strict';

// Load ENV
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();
console.log(process.env);

// Lambda Handler
module.exports.handler = function(event, context) {
  return context.done(null, { message: 'simple lambda function has run successfully' });
};
