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

        state.restApiId = JAWS._meta.projectJson.restApiId;
        resolve(state);

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

            state.lambdas = [];

            // Check each lambda has a 'path', otherwise it's not an API endpoint
            async.eachSeries(lambdas, function(lambda, cb){

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
  JAWS._dapiProcessResources = function(state) {

    return client.listResources(state.restApiId).then(function(response) {

      // Parse HAL response
      state.resources = response._embedded.item;
      if (!Array.isArray(state.resources)) state.resources = [state.resources];
      console.log(state)
      //async.eachLimit(state.lambdas, function(lambda, cb) {
      //
      //
      //
      //
      //}, function(error) {
      //  console.log(error);
      //});
    });
  };


  /**
   * Process Single Lambda
   * @param lambda
   * @returns {Promise}
   * @private
   */
  JAWS._dapiProcessLambda = function(lambdaPath) {
    return new Promise(function(resolve, reject) {

       var json = require(path.join(JAWS._meta.projectRootPath, lambdaPath));

       // Check if Lambda is REST API endpoint
       if (!json.lambda || !json.lambda.path) resolve(false);

       // Find or create resources
       var resources = json.lambda.path.split('/');


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
      return resolve({ stage: stage });

    })
        .then(this._dapiFindOrCreateApi)
        .then(this._dapiFindAllLambdas)
        .then(this._dapiProcessResources);
  };
};
