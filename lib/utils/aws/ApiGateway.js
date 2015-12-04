'use strict';

/**
 * Serverless Services: AWS: API Gateway
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    SError    = require('../../ServerlessError'),
    SUtils    = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const ApiGateway = BbPromise.promisifyAll(new AWS.APIGateway(config), { suffix: "Promised" });

  // Return configured, customized instance
  return ApiGateway;

};