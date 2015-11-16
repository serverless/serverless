'use strict';

/**
 * JAWS Services: AWS: API Gateway
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const ApiGateway = BbPromise.promisifyAll(new AWS.APIGateway(config));

  // Return configured, customized instance
  return ApiGateway;

};

///**
// * Create REST API
// */
//
//module.exports.createRestApi = function(name, description) {
//
//  var params = {
//    name: name,
//    cloneFrom: null,
//    description: description
//  };
//
//  return ApiGateway.createRestApiAsync(params);
//};
//
///**
// * Get REST APIs
// */
//
//module.exports.getRestApis = function() {
//
//  var params = {
//    limit: 500,
//    //position:
//  };
//
//  return ApiGateway.getRestApisAsync(params);
//};
//
///**
// * Get Resources
// */
//
//module.exports.getResources = function(restApiId) {
//
//  var params = {
//    restApiId: restApiId,
//    limit: 500,
//    //position:
//  };
//
//  return ApiGateway.getResourcesAsync(params);
//};
//
///**
// * Create Resource
// */
//
//module.exports.createResource = function(restApiId, parentId, pathPart) {
//
//  var params = {
//    parentId: parentId, /* required */
//    pathPart: pathPart, /* required */
//    restApiId: restApiId, /* required */
//  };
//
//  return ApiGateway.createResourceAsync(params);
//};
//
///**
// * Get Method
// */
//
//module.exports.getMethod = function(restApiId, resourceId, httpMethod) {
//
//  var params = {
//    httpMethod: httpMethod, /* required */
//    resourceId: resourceId, /* required */
//    restApiId:  restApiId   /* required */
//  };
//
//  return ApiGateway.getMethodAsync(params);
//};
//
///**
// * Delete Method
// */
//
//module.exports.deleteMethod = function(restApiId, resourceId, httpMethod) {
//
//  var params = {
//    httpMethod: httpMethod, /* required */
//    resourceId: resourceId, /* required */
//    restApiId:  restApiId   /* required */
//  };
//
//  return ApiGateway.deleteMethodAsync(params);
//};
//
///**
// * Put Method
// */
//
//module.exports.putMethod = function(restApiId, resourceId, httpMethod, requestModels, requestParameters, apiKeyRequired, authorizationType) {
//  console.log(restApiId, resourceId, httpMethod, requestModels, requestParameters, apiKeyRequired, authorizationType)
//  var params = {
//    authorizationType: authorizationType, /* required */
//    httpMethod: httpMethod, /* required */
//    resourceId: resourceId, /* required */
//    restApiId: restApiId, /* required */
//    apiKeyRequired: apiKeyRequired,
//    requestModels: requestModels,
//    requestParameters: requestParameters
//  };
//
//  return ApiGateway.putMethodAsync(params);
//};
//
///**
// * Put Integration Body
// */
//
//module.exports.putIntegrationBody = function(restApiId, resourceId, httpMethod, requestModels, requestParameters, apiKeyRequired, authorizationType) {
//  console.log(restApiId, resourceId, httpMethod, requestModels, requestParameters, apiKeyRequired, authorizationType)
//  var params = {
//    authorizationType: authorizationType, /* required */
//    httpMethod: httpMethod, /* required */
//    resourceId: resourceId, /* required */
//    restApiId: restApiId, /* required */
//    apiKeyRequired: apiKeyRequired,
//    requestModels: requestModels,
//    requestParameters: requestParameters
//  };
//
//  return ApiGateway.putMethodAsync(params);
//};

