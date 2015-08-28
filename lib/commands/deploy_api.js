'use strict';

/**
 * JAWS Command: deploy api <stage>
 * - Deploys project's API Gateway REST API to the specified stage
 */
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
  var client = null;
  /**
   * Find Or Create Rest Api
   * @returns {bluebird|exports|module.exports}
   * @private
   */
  JAWS._dapiFindOrCreateApi = function(state) {
    return new Promise(function(resolve, reject) {

      // Set Region
      state.region = Object.keys(JAWS._meta.projectJson.regions)[0];
      state.restApiId = JAWS._meta.projectJson.regions[state.region].restApiId || null;

      // Validate Stage
      if (!JAWS._meta.projectJson.regions[state.region].stages[state.stage]) {
        reject(new JawsError(
            'This stage doesn\'t exist.  Please add it to the jaws.json file at the root of your project',
            JawsError.errorCodes.UNKNOWN));
      }

      // Instantiate JawsApiGatewayClient
      client = new JawsAPIClient({
        accessKeyId:     JAWS._meta.credentials.aws_access_key_id,
        secretAccessKey: JAWS._meta.credentials.aws_secret_access_key,
        region:          state.region,
      });

      // Start Spinner
      state.spinner = new Spinner('%s Creating your REST API for the state "' + state.stage + '"...');
      state.spinner.setSpinnerString('|/-\\');
      state.spinner.start();

      // Check Project's jaws.json for restApiId, otherwise create an api
      if (state.restApiId) {

        // Show existing REST API
        client.showRestApi(state.restApiId).then(function(response) {

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
          JAWS._meta.projectJson.regions[state.region].restApiId = response.id;
          var newJson = JSON.stringify(JAWS._meta.projectJson, null, 2);
          fs.writeFileSync(path.join(JAWS._meta.projectRootPath, 'jaws.json'), newJson);

          state.restApiId = response.id;
          resolve(state);
        });
      }
    });
  };

  /**
   * Delete All API Resources
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiDeleteAllResources = function(state) {

    // List all Resources for this REST API
    return client.listResources(state.restApiId).then(function(response) {
      return new Promise(function(resolve, reject) {

        // Parse API Gateway's HAL response
        var apiResources = response._embedded.item;
        if (!Array.isArray(apiResources)) apiResources = [apiResources];

        // Delete Every Resource
        async.eachSeries(apiResources, function(resource, cb) {

          // If Parent Resource ('/'), save its ID and skip
          if (resource.path === '/') {
            state.resourceParentId = resource.id;
            return cb();
          }

          // Delete Resource
          client.deleteResource(state.restApiId, resource.id)
              .then(function(response) {
                return cb();
              })
              .catch(function(error) {
                return cb();
              });

        }, function(error) {resolve(state);});
      });
    });
  };

  /**
   * Find All Endpoint Modules
   * @private
   */
  JAWS._dapiFindAllEndpoints = function(state) {

    return utils.findAllEndpoints(JAWS._meta.projectRootPath)
        .then(function(endpoints) {
          return new Promise(function(resolve, reject) {

            // Check each lambda has a 'path', otherwise it's not an API endpoint
            async.eachSeries(endpoints, function(endpoint, cb) {

              // Load Endpoint JSON
              var endpointJson = require(path.join(JAWS._meta.projectRootPath, endpoint));

              if (endpointJson.endpoint) {

                // Remove CloudFormation Snippet
                if (endpointJson.cfExtension) delete endpointJson.cfExtension;

                // Push to state's endpoints
                state.endpoints.push(endpointJson);
              }

              return cb();

            }, function(error) { resolve(state); });
          });
        });
  };

  /**
   * Create Resources
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateResources = function(state) {
    return new Promise(function(resolve, reject) {

      // Store created resources
      var createdResources = [];

      // Loop through each Endpoint and check if its required resources have been created
      async.eachSeries(state.endpoints, function(endpoint, endpointCb) {

        // Each part of the path is a resource, turn this into an array
        var endpointResources = endpoint.endpoint.path.split('/');

        // Add "apig" property
        endpoint.endpoint.apig = {};

        // Loop through each resource required by the Endpoint's Path
        async.eachSeries(endpointResources, function(endpointResource, resourceCb) {

          // Remove any slashes
          endpointResource = endpointResource.replace(/\//g, '');

          // If already created, skip
          for (var i = 0; i < createdResources.length; i++) {
            if (endpointResource === createdResources[i].pathPart) {

              return resourceCb();
            }
          }

          // Get This Resource's Parent ID
          var parentIndex = endpointResources.indexOf(endpointResource) - 1;
          if (parentIndex === -1) {
            endpoint.endpoint.apig.parentResourceId = state.resourceParentId;
          } else if (parentIndex > -1) {

            // Get Parent Resource ID
            for (var i = 0; i < createdResources.length; i++) {
              if (createdResources[i].pathPart === endpointResources[parentIndex]) {
                endpoint.endpoint.apig.parentResourceId = createdResources[i].id;
              }
            }
          }

          // Throw error if no parentId is found
          if (!endpoint.endpoint.apig.parentResourceId) reject(new JawsError(
              'Couldn\'t find a parent resource for ' + endpointResource,
              JawsError.errorCodes.UNKNOWN));

          // Create Resource
          client.createResource(state.restApiId, endpoint.endpoint.apig.parentResourceId, endpointResource)
              .then(function(response) {
                // Add resource to state.resources and callback
                createdResources.push(response);
                return resourceCb();
              }).catch(function(error) {
                reject(new JawsError(
                    error.message,
                    JawsError.errorCodes.UNKNOWN));
              });

        }, function(error) {

          // Attach the resource to the state's endpoint for later use
          var endpointResource = endpoint.endpoint.path.split('/').pop().replace(/\//g, '');
          for (var i = 0; i < createdResources.length; i++) {
            if (createdResources[i].pathPart === endpointResource) {
              endpoint.endpoint.apig.resource = createdResources[i];
            }
          }

          return endpointCb();
        });
      }, function(error) { resolve(state); });
    });
  };

  /**
   * Create Methods
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateMethods = function(state) {
    return new Promise(function(resolve, reject) {

      // Loop through Endpoints
      async.eachSeries(state.endpoints, function(endpoint, cb) {

        // Create Method
        var methodBody = {
          authorizationType: endpoint.endpoint.authorizationType,
        };

        // If Request Params, add them
        if (endpoint.endpoint.requestParameters) {

          methodBody.requestParameters = {};

          // Format them per APIG's API's Expectations
          for (var prop in endpoint.endpoint.requestParameters) {
            var requestParam = endpoint.endpoint.requestParameters[prop];
            methodBody.requestParameters[requestParam] = true;
          }
        }

        // Create Method
        client.putMethod(state.restApiId, endpoint.endpoint.apig.resource.id, endpoint.endpoint.method, methodBody)
            .then(function(response) {

              // Save method to Lambda apig property
              endpoint.endpoint.apig.method = response;

              return cb();
            }).catch(function(error) {
              return reject(new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN));
            });

      }, function(error) { resolve(state); });
    });
  };

  /**
   * Create Integrations
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateIntegrations = function(state) {
    return new Promise(function(resolve, reject) {

      // Loop through Endpoints
      async.eachSeries(state.endpoints, function(endpoint, cb) {

        // Create Integration
        if (typeof endpoint.lambda !== 'undefined') {

          var integrationBody = {
            type: 'AWS',
            httpMethod: 'POST',
            authorizationType: 'none',
            uri: 'arn:aws:apigateway:'
                     + state.region
                     + ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                     + state.region
                     + ':814070455730:function:'
                     + [state.stage,
                          JAWS._meta.projectJson.name,
                          endpoint.lambda.functionName,
                        ].join('_-_').replace(/ /g, '')
                     + '/invocations',
            credentials:         null,
            requestParameters:   endpoint.endpoint.requestParameters || {},
            requestTemplates:    endpoint.endpoint.requestTemplates || {},
            cacheNamespace:      endpoint.endpoint.cacheNamespace || null,
            cacheKeyParameters:  endpoint.endpoint.cacheKeyParameters || [],
          };
        } else {
          reject(new JawsError(
              'JAWS API Gateway integration currently supports lambda only',
              JawsError.errorCodes.UNKNOWN));
        }

        // Create Integration
        client.putIntegration(state.restApiId,
            endpoint.endpoint.apig.resource.id,
            endpoint.endpoint.method,
            integrationBody)
            .then(function(response) {

              // Save integration to apig property
              endpoint.endpoint.apig.integration = response;

              return cb();
            }).catch(function(error) {

              return reject(new JawsError(
                  error.message,
                  JawsError.errorCodes.UNKNOWN));
            });

      }, function(error) { resolve(state); });
    });
  };

  /**
   * Create Method Responses
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateMethodResponses = function(state) {
    return new Promise(function(resolve, reject) {

      // Loop through Endpoints
      async.eachSeries(state.endpoints, function(endpoint, endpointCb) {

        // Collect response keys to an array
        if (endpoint.endpoint.responses) var responses = Object.keys(endpoint.endpoint.responses);
        else var responses = [];

        // Loop through Responses
        async.eachSeries(responses, function(responseKey, responseCb) {

          var thisResponse = endpoint.endpoint.responses[responseKey];
          var methodResponseBody = {};

          // Format Response Parameters per APIG API's Expectations
          for (prop in thisResponse.responseParameters) {
            var param = endpoint.endpoint.responseParameters[prop];
            methodResponseBody.responseParameters[param[prop]] = true;
          }

          // Create Method Response
          client.putMethodResponse(state.restApiId,
              endpoint.endpoint.apig.resource.id,
              endpoint.endpoint.method,
              thisResponse.statusCode,
              methodResponseBody)
              .then(function(response) {
                return responseCb();
              }).catch(function(error) {
                reject(new JawsError(
                    error.message,
                    JawsError.errorCodes.UNKNOWN));
              });
        }, function(error) { return endpointCb(); });
      }, function(error) { resolve(state); });
    });
  };

  /**
   * Create Integration Responses
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateIntegrationResponses = function(state) {
    return new Promise(function(resolve, reject) {

      // Loop through Endpoints
      async.eachSeries(state.endpoints, function(endpoint, endpointCb) {

        // Collect response keys to an array
        if (endpoint.endpoint.responses) var responses = Object.keys(endpoint.endpoint.responses);
        else var responses = [];

        // Loop through Responses
        async.eachSeries(responses, function(responseKey, responseCb) {

          var thisResponse = endpoint.endpoint.responses[responseKey];
          var integrationResponseBody = {};

          // Add Response Parameters
          integrationResponseBody.responseParameters = thisResponse.responseParameters;

          // Add Response Templates
          integrationResponseBody.responseTemplates = thisResponse.responseTemplates;

          // Add SelectionPattern
          integrationResponseBody.selectionPattern = responseKey;

          // Create Integration Response
          client.putIntegrationResponse(state.restApiId,
              endpoint.endpoint.apig.resource.id,
              endpoint.endpoint.method,
              thisResponse.statusCode,
              integrationResponseBody)
              .then(function(response) {
                return responseCb();
              }).catch(function(error) {
                reject(new JawsError(
                    error.message,
                    JawsError.errorCodes.UNKNOWN));
              });
        }, function(error) { return endpointCb(); });
      }, function(error) { resolve(state); });
    });
  };
  /**
   * Create Deployment
   * @param state
   * @returns {*}
   * @private
   */
  JAWS._dapiCreateDeployment = function(state) {
    return new Promise(function(resolve, reject) {
      var deployment = {
        stageName: state.stage,
        stageDescription: state.stage,
        description: 'JAWS deployment',
      };

      client.createDeployment(state.restApiId, deployment)
          .then(function(response) {

            // Add deployment to state
            state.deployment = response;
            resolve(state);
          })
          .catch(function(error) {
            reject(new JawsError(
                error.message,
                JawsError.errorCodes.UNKNOWN));
          });
    });
  };

  /**
   * Deploy API
   * @param stage
   * @returns {bluebird|exports|module.exports}
   */
  JAWS.deployApi = function(stage) {
    return new Promise(function(resolve, reject) {

      // Create state object for all functions
      return resolve({
        stage: stage.toLowerCase().trim(),
        region: null,
        restApiId: null,
        resourceParentId: null,
        endpoints: [],
      });

    })
        .then(this._dapiFindOrCreateApi)
        .then(this._dapiDeleteAllResources)
        .then(this._dapiFindAllEndpoints)
        .then(this._dapiCreateResources)
        .then(this._dapiCreateMethods)
        .then(this._dapiCreateIntegrations)
        .then(this._dapiCreateMethodResponses)
        .then(this._dapiCreateIntegrationResponses)
        .then(this._dapiCreateDeployment)
        .then(function(state) {

          state.spinner.stop(true);
          console.log('API successfully deployed: https://'
              + state.restApiId
              + '.execute-api.'
              + state.region
              + '.amazonaws.com/'
              + state.stage + '/');

          return Promise.resolve();
        });
  };
};
