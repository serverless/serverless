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
function ApiDeployer(stage, region, prjJson, prjRootPath, prjCreds) {
  this.stage = stage;
  this.region = region;
  this.prjJson = prjJson;
  this.prjRootPath = prjRootPath;
  this.prjCreds = prjCreds;
  this.client = new JawsAPIClient({
    accessKeyId:     prjCreds.aws_access_key_id,
    secretAccessKey: prjCreds.aws_secret_access_key,
    region:          region,
  });
};

ApiDeployer.prototype.deploy = Promise.method(function(input) {

  var _this = this;

  _this._validateRegion()
      .then(function() {
        return;
      });
});

ApiDeployer.prototype._validateRegion = Promise.method(function() {

  var _this = this;

  // If region specified in command, check it exists
  if (_this.region) {
    _this.region = _this.region.toLowerCase().trim();
    var exists = false;
    for (var i = 0;i < _this.prjJson.project.stages[_this.stage].length;i++) {
      if (_this.region === _this.prjJson.project.stages[_this.stage][i].region) {
        exists = true;
        // Add region JSON to region variable
        _this.region = _this.prjJson.project.stages[_this.stage][i];
        break;
      }
    }
    if (!exists) {
      throw new JawsError(
          'This region "' + _this.region + '" does not exist in this stage.',
          JawsError.errorCodes.UNKNOWN);
    }
  }

  return;
});



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

            // Make regions array.  If no region specified, deploy to all regions
            var regions = region
                ? [region]
                : JAWS._meta.projectJson.project.stages[stage];

            // Loop through each region and deploy
            async.eachLimit(regions, function(region, cb) {

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

