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

  /**
   * Get REST API By Name
   */

  ApiGateway.sGetApiByName = function(restApiName, stage, region) {

    let _this = this;

    // Validate Length
    if (restApiName.length > 1023) {
      throw new SError('"'
        + restApiName
        + '" cannot be used as a REST API name because it\'s over 1023 characters.  Please make it shorter.');
    }

    // Sanitize
    restApiName = restApiName.trim();

    let params = {
      limit: 500
    };

    // List all REST APIs
    return _this.getRestApisPromised(params)
      .then(function(response) {

        let restApi = null,
          found = 0;

        // Find REST API w/ same name as project
        for (let i = 0; i < response.items.length; i++) {

          if (response.items[i].name === restApiName) {

            restApi = response.items[i];
            found++;

            SUtils.sDebug(
              '"'
              + stage
              + ' - '
              + region
              + '": found existing REST API on AWS API Gateway with name: '
              + restApiName);

          }
        }

        // Throw error if they have multiple REST APIs with the same name
        if (found > 1) {
          throw new SError('You have multiple API Gateway REST APIs in the region ' + region + ' with this name: ' + restApiName);
        }

        if (restApi) return restApi;
      });
  };

  /**
   * Find Or Create REST API
   */

  ApiGateway.sFindOrCreateRestApi = function(restApiName, stage, region) {

    let _this = this;

    return _this.sGetApiByName(restApiName, stage, region)
      .then(function(restApi) {

        // Return, if found
        if (restApi) return restApi;

        // Otherwise, create new REST API
        let params = {
          name:        restApiName, /* required */
          description: 'A REST API for a Serverless project in region: ' + region
        };

        return _this.createRestApiPromised(params)
          .then(function (response) {

            SUtils.sDebug(
              '"'
              + stage
              + ' - '
              + region
              + '": created a new REST API on AWS API Gateway with name: '
              + response.name);

            return response;
          });
      });
  };

  // Return configured, customized instance
  return ApiGateway;
};