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
   * Find Or Create REST API
   */

  ApiGateway.sFindOrCreateRestApi = function(S, stage, region) {

    let _this = this;

    // Load Region JSON
    let regionJson = SUtils.getRegionConfig(
        S._projectJson,
        stage,
        region);

    // Check Project's s-project.json for restApiId, otherwise create a REST API in this region.
    if (regionJson.restApiId) {

      let params = {
        restApiId: regionJson.restApiId /* required */
      };

      // Show existing REST API
      return _this.getRestApiPromised(params)
          .then(function(response) {

            SUtils.sDebug(
                '"'
                + stage + ' - '
                + region
                + '": found existing REST API on AWS API Gateway with ID: '
                + response.id);

            return response;
          });

    } else {

      let params = {
        limit: 500
      };

      // List all REST APIs
      return _this.getRestApisPromised(params)
          .then(function(response) {

            let restApiId = false;

            // Find REST API w/ same name as project
            for (let i = 0; i < response.items.length;i++) {

              if (response.items[i].name === S._projectJson.name) {

                restApiId = response.items[i].id;

                // Save restApiId to s-project.json for future use
                SUtils.saveRegionalApi(
                    S._projectJson,
                    region,
                    restApiId,
                    S.config.projectPath
                );

                SUtils.sDebug(
                    '"'
                    + stage + ' - '
                    + region
                    + '": found existing REST API on AWS API Gateway with ID: '
                    + restApiId);

                break;
              }
            }

            if (restApiId) return restApiId;

            // If no REST API found, create one
            let apiName = S._projectJson.name;
            apiName = apiName.substr(0, 1023); // keep the name length below the limits

            let params = {
              name: apiName, /* required */
              description: S._projectJson.description ? S._projectJson.description : 'A REST API for a Serverless project.'
            };

            return _this.createRestApiPromised(params)
                .then(function (response) {

                  // Save RestApiId to s-project.json, fetch it from here later
                  SUtils.saveRegionalApi(
                      S._projectJson,
                      region,
                      response.id,
                      S.config.projectPath
                  );

                  SUtils.sDebug(
                      '"'
                      + stage + ' - '
                      + region
                      + '": created a new REST API on AWS API Gateway with ID: '
                      + response.id);

                  return response;
                });
          });
    }
  };

  // Return configured, customized instance
  return ApiGateway;

};