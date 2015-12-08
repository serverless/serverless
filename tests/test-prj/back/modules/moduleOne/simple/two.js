'use strict';

// Load ENV
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();
console.log(process.env);

// Lambda Handler
module.exports.one = function(event, context) {
  return context.done(null, { message: '"Simple Two - One" lambda function has run successfully' });
};
