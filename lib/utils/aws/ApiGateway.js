'use strict';

/**
 * JAWS Services: AWS: API Gateway
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Require configured AWS-SDK
const AWS = require('../aws').aws;
const ApiGateway = BbPromise.promisifyAll(new AWS.APIGateway());

/**
 * Create REST API
 */

module.exports.createRestApi = function(name, description) {

  var params = {
    name: name,
    cloneFrom: null,
    description: description
  };

  return ApiGateway.createRestApiAsync(params);
};

/**
 * Get REST APIs
 */

module.exports.getRestApis = function() {

  var params = {
    limit: 500,
    //position:
  };

  return ApiGateway.getRestApisAsync(params);
};

/**
 * Get Resources
 */

module.exports.getResources = function(restApiId) {

  var params = {
    restApiId: restApiId,
    limit: 500,
    //position:
  };

  return ApiGateway.getResourcesAsync(params);
};

