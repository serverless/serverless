'use strict';

/**
 * JAWS Command: deploy api <stage>
 * - Deploys project's API Gateway REST API to the specified stage
 */

// Defaults
var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    os = require('os'),
    wrench = require('wrench'),
    async = require('async'),
    AWSUtils = require('../utils/aws'),
    inquirer = require('bluebird-inquirer'),
    chalk = require('chalk'),
    utils = require('../utils/index'),
    shortid = require('shortid'),
    extend = require('util')._extend,
    Spinner = require('cli-spinner').Spinner,
    JawsAPIClient = require('jaws-api-gateway-client');

Promise.promisifyAll(fs);


module.exports = function(JAWS) {

  // Instantiate JawsApiGatewayClient
  var client = new JawsAPIClient({
    accessKeyId:     JAWS._meta.credentials.aws_access_key_id,
    secretAccessKey: JAWS._meta.credentials.aws_secret_access_key,
    region:          JAWS._meta.projectJson.awsRegions[0],
  });

  /**
   * Find Or Create Rest Api
   * @returns {bluebird|exports|module.exports}
   * @private
   */
  JAWS._dapiFindOrCreateApi = function(state) {
    return new Promise(function(resolve, reject) {

      // Check Project's jaws.json for restApiId, otherwise create an api
      if (JAWS._meta.projectJson.restApiId) {

        client.showRestApi(JAWS._meta.projectJson.restApiId).then(function(response) {

          state.restApiId = JAWS._meta.projectJson.restApiId;
          resolve(state);

        }).catch(function(error) {
          reject(new JawsError(
              error.message,
              JawsError.errorCodes.UNKNOWN));
        });

      } else {

        // Create REST API
        client.createRestApi({
          name:        JAWS._meta.projectJson.name,
          description: JAWS._meta.projectJson.description,
        }).then(function(response) {

          // Update Project's jaws.json
          JAWS._meta.projectJson.restApiId = response.id;
          var newJson = JSON.stringify(JAWS._meta.projectJson, null, 2);
          fs.writeFileSync(path.join(JAWS._meta.projectRootPath, 'jaws.json'), newJson);

          state.restApiId = response.id;
          resolve(state);
        });
      }
    });
  };

  /**
   * Find All Lambdas
   * @private
   */
  JAWS._dapiFindAllLambdas = function(state) {
    return utils.findAllLambdas(JAWS._meta.projectRootPath)
        .then(function(lambdas) {
          return new Promise(function(resolve, reject) {

            // Check each lambda has a 'path', otherwise it's not an API endpoint
            async.eachSeries(lambdas, function(lambda, cb){

              // Load Lambda JSON
              var lambdaJson = require(path.join(JAWS._meta.projectRootPath, lambda));

              if (lambdaJson && lambdaJson.lambda && lambdaJson.lambda.path) {

                // Remove CloudFormation Snippet
                if (lambdaJson.cfExtension) delete lambdaJson.cfExtension;

                // Push to state's lambdas
                state.lambdas.push(lambdaJson);
              }

              return cb();

            },function(error){
              resolve(state);
            });
          });
        });
  };

  /**
   * Process Resources
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateOrUpdateResources = function(state) {

    return client.listResources(state.restApiId).then(function(response) {

      return new Promise(function(resolve, reject) {

        // Parse HAL response
        state.apiResources = response._embedded.item;
        if (!Array.isArray(state.apiResources)) state.apiResources = [state.apiResources];

        // Find top-level resource ('/') id
        for(var i=0; i < state.apiResources.length; i++) {
          if (state.apiResources[i].path === '/') state.resourceParentId = state.apiResources[i].id;
        }

        // Loop through each Lambda and check if its required resources have been created
        async.eachSeries(state.lambdas, function(lambda, lambdaCb) {

          // Add "apig" property
          lambda.lambda.apig = {};

          var lambdaResources = lambda.lambda.path.split('/');

          // Loop through each required resource sequentially
          async.eachSeries(lambdaResources, function(lambdaResource, resourceCb) {

            lambdaResource = lambdaResource.replace(/\//g, '');

            // Loop through API Gateway resources, check if exists for the required lambda resource
            for(var i=0; i < state.apiResources.length; i++) {

              // Skip if '/' root resource
              if (state.apiResources[i].path === '/') continue;

              var resourcePath = state.apiResources[i].pathPart;
              if (lambdaResource === resourcePath) {

                // Add Resource object to Lambda object
                lambda.lambda.apig.resource = state.apiResources[i];

                // Callback
                return resourceCb();
              }
            }

            // Find Resource Parent ID
            var index = lambdaResources.indexOf(lambdaResource);
            var parentId = null;

            if (index === 0) {
              // If index is 0, add resource parent id
              parentId = state.resourceParentId;
            } else {

              // Otherwise, pull id from parent resource
              var parentResource = lambdaResources[index - 1];
              for (i=0; i < state.apiResources.length; i++) {
                var resourcePath = state.apiResources[i].path.replace(/\//g, '');
                if (parentResource === resourcePath) parentId = state.apiResources[i].id;
              }
            }

            // Create Resource
            client.createResource(state.restApiId, parentId, lambdaResource).then(function(response) {

              // Add resource to state.resources and callback
              state.apiResources.push(response);

              // Add Resource object to Lambda object
              lambda.lambda.apig.resource = response;

              return resourceCb();

            });

          }, function(error) {

            return lambdaCb();

          });
        }, function(error) {
          resolve(state);
        });
      });
    });
  };

  /**
   * Process Methods
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateOrUpdateMethods = function(state) {
    return new Promise(function(resolve, reject) {

      // Loop through Lambdas
      async.eachSeries(state.lambdas, function(lambda, cb) {

        // Create Method
        var methodBody = {
          "authorizationType" : lambda.lambda.authorizationType,
          "apiKeyRequired" : lambda.lambda.apiKeyRequired,
          "requestParameters" : lambda.lambda.requestParameters,
          "requestModels" : lambda.lambda.requestModels
        };

        // Delete Method
        client.deleteMethod(state.restApiId, lambda.lambda.apig.resource.id, lambda.lambda.method)
            .then(function(response) {

              // Create Method
              client.createMethod(state.restApiId, lambda.lambda.apig.resource.id, lambda.lambda.method, methodBody)
                  .then(function(response) {

                    // Save method to Lambda apig property
                    lambda.lambda.apig.method = response;

                    return cb();
                  }).catch(function(error) {
                    return reject(new JawsError(
                        error.message,
                        JawsError.errorCodes.UNKNOWN));
                  });

            }).catch(function(error) {

              // Create Method
              client.createMethod(state.restApiId, lambda.lambda.apig.resource.id, lambda.lambda.method, methodBody)
                  .then(function(response) {

                    // Save method to Lambda apig property
                    lambda.lambda.apig.method = response;

                    return cb();
                  }).catch(function(error) {
                    return reject(new JawsError(
                        error.message,
                        JawsError.errorCodes.UNKNOWN));
                  });
            });
      }, function(error) {
          console.log(state);
          resolve(state);
      });
    });
  };

  /**
   * Clean-Up
   * - Remove unnecessary Resources, Methods, etc.
   */

  //JAWS.dapiCleanUp = function() {
  //
  //  // Destroy inactive resources
  //  async.eachSeries(state.apiResources, function(apiResource, cb) {
  //
  //    // If resource is root resource ('/'), skip
  //    if (apiResource.path === '/') return cb();
  //
  //    // If resource is being used by a lamdba, do nothing and skip
  //    if (~state.lambdaResources.indexOf(apiResource.pathPart)) return cb();
  //    console.log('Deleting:', apiResource.pathPart);
  //    // If resource is not being used by a lambda, delete it from API Gateway
  //    // Deleting a parent resource WILL delete all child resources
  //    client.deleteResource(state.restApiId, apiResource.id)
  //        .then(function(response) {
  //
  //          // Remove from resources array
  //          var index = state.apiResources.indexOf(apiResource);
  //          state.apiResources.splice(index, 1);
  //
  //          return cb();
  //        })
  //        .catch(function(error) {
  //          reject(new JawsError(
  //              error.message,
  //              JawsError.errorCodes.UNKNOWN));
  //        });
  //
  //  }, function(error) {
  //
  //    resolve(state);
  //
  //  });
  //};

  /**
   * Deploy API
   * @param stage
   * @returns {bluebird|exports|module.exports}
   */
  JAWS.deployApi = function(stage) {
    return new Promise(function(resolve, reject) {

      // Create state object for all functions
      return resolve({
        stage: stage,
        restApiId: null,
        resourceParentId: null,
        lambdas: [],
        apiResources: [],
      });
    })
        .then(this._dapiFindOrCreateApi)
        .then(this._dapiFindAllLambdas)
        .then(this._dapiCreateOrUpdateResources)
        .then(this._dapiCreateOrUpdateMethods);

    // TODO: Create methods, response templates, etc.

  };
};
