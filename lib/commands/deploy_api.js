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
    JawsAPIClient = require('jaws-api-gateway-client'),
    client = null,
    spinner = null;

Promise.promisifyAll(fs);

/**
 * Api Deployer Class
 * @param stage
 * @param regions
 * @param prjJson
 * @param prjRootPath
 * @param prjCreds
 * @constructor
 */
function ApiDeployer(stage, region, prjRootPath, prjJson, prjCreds) {

  var _this = this;
  _this._stage = stage;
  _this._region = region;
  _this._prjJson = prjJson;
  _this._prjRootPath = prjRootPath;
  _this._prjCreds = prjCreds;
  _this._endpoints = [];
  _this._resources = [];
  _this.awsAccountNumber = _this._region.iamRoleArn.replace('arn:aws:iam::','').split(':')[0];
  _this._restApiId = _this._region.restApiId ?  _this.region.restApiId : null;

  // Instantiate API Gateway Client
  this.ApiClient = new JawsAPIClient({
    accessKeyId:     prjCreds.aws_access_key_id,
    secretAccessKey: prjCreds.aws_secret_access_key,
    region:          region.region,
  });
};

/**
 * Deploy
 */
ApiDeployer.prototype.deploy = Promise.method(function(input) {

  var _this = this;

  return _this._findOrCreateApi()
      .bind(this)
      .then(_this._listApiResources)
      .then(function() {
        console.log("Here", _this);
      });
});

/**
 * Find Or Create API
 */
ApiDeployer.prototype._findOrCreateApi = Promise.method(function(input) {

  var _this = this;

  // Check Project's jaws.json for restApiId, otherwise create an api
  if (_this._restApiId) {

    // Show existing REST API
    return _this.ApiClient.showRestApi(_this._restApiId)
        .then(function(response) {
          _this._restApiId = response.id;
          return;
        })
        .catch(function(error) {
          throw new JawsError(
              error.message,
              JawsError.errorCodes.UNKNOWN);
        });
  } else {

    // Create REST API
    return _this.ApiClient.createRestApi({
      name:        _this._prjJson.name,
      description: _this._prjJson.description ? _this._prjJson.description : 'A REST API for a JAWS project.',
    }).then(function(response) {
      _this._restApiId = response.id;
      return;
    });
  }
});

/**
 * List API Resources
 */
ApiDeployer.prototype._listApiResources = Promise.method(function(input) {

  var _this = this;

  // List all Resources for this REST API
  return _this.ApiClient.listResources(_this._restApiId)
      .then(function(response) {

        // Parse API Gateway's HAL response
        var apiResources = response._embedded.item;
        if (!Array.isArray(apiResources)) apiResources = [apiResources];

        // Get Parent Resource ID
        for (var i = 0; i < apiResources.length; i++) {
          if (apiResources[i].path === '/') {
            _this._parentResourceId = apiResources[i].id;
          }
        }

        return Promise.resolve();
      })
      .catch(function(error) {
        throw new JawsError(
            error.message,
            JawsError.errorCodes.UNKNOWN);
      });
});

/**
 *
 * @param JAWS
 */

module.exports = function(JAWS) {

  /**
   * Deploy API
   * @param stage
   * @returns {bluebird|exports|module.exports}
   */
  JAWS.deployApi = function (stage, region, allTagged) {
    return new Promise(function(resolve, reject) {

      // Check stage exists
      stage = stage.toLowerCase().trim();
      if (!JAWS._meta.projectJson.project.stages[stage]) {
        reject(new JawsError(
            'The stage "' + stage
            + '" does not exist.  Please generate this stage if you would like to deploy to it.',
            JawsError.errorCodes.UNKNOWN));
      }

      // Check if stage has regions
      if (!JAWS._meta.projectJson.project.stages[stage].length) {
        reject(new JawsError(
            'You do not have any regions set for this stage.  Add one before deploying.',
            JawsError.errorCodes.UNKNOWN));
      }

      // Tag CWD if necessary
      (allTagged ? Promise.resolve() : JAWS.tag('api', null, false))
          .then(function() {

            // Validate region.  If no region specified, deploy to all regions
            if (!region) {

              var regions = JAWS._meta.projectJson.project.stages[stage];
            } else {

              region = region.toLowerCase().trim();
              for (var i = 0;i <  JAWS._meta.projectJson.project.stages[stage].length; i++) {
                var tempRegion = JAWS._meta.projectJson.project.stages[stage][i];
                if (region === tempRegion.region) var regions = [tempRegion];
              }

              // If missing region, throw error
              if (!regions) {
                reject(new JawsError(
                    'The region "' + region + '" does not exist in this stage.',
                    JawsError.errorCodes.UNKNOWN));
              }
            }

            // Loop through each region and deploy
            async.eachLimit(regions, 1, function(region, cb) {

              var deployer = new ApiDeployer(
                  stage,
                  region,
                  JAWS._meta.projectRootPath,
                  JAWS._meta.projectJson,
                  JAWS._meta.credentials
              );
              deployer.deploy()
                  .then(function() {
                    return cb();
                  });

            }, function(error) {
              console.log('Done!');
            });
          })
    });
  }
};

