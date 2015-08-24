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
    async = require('async'),
    AWSUtils = require('../utils/aws'),
    inquirer = require('bluebird-inquirer'),
    chalk = require('chalk'),
    utils = require('../utils/index'),
    shortid = require('shortid'),
    extend = require('util')._extend, //OK per Isaacs and http://stackoverflow.com/a/22286375/563420
    Spinner = require('cli-spinner').Spinner,
    JawsAPIClient = require('jaws-api-gateway-client');

Promise.promisifyAll(fs);


module.exports = function(JAWS) {

  /**
   * Find Or Create Rest Api
   * @returns {bluebird|exports|module.exports}
   * @private
   */

  JAWS._findOrCreateRestApi = function() {
    return new Promise(function(resolve, reject) {

      // Check Project's jaws.json for restApiId, otherwise create an api
      if (JAWS._meta.projectJson.restApiId) {

        resolve(JAWS._meta.projectJson.restApiId);

      } else {

        // Get AWS profile credentials
        var credentials = AWSUtils.profilesGet(JAWS._meta.profile);

        //  Instantiate JawsApiGatewayClient
        var client = new JawsAPIClient({
          accessKeyId:     credentials[JAWS._meta.profile].aws_access_key_id,
          secretAccessKey: credentials[JAWS._meta.profile].aws_secret_access_key,
          region:          JAWS._meta.projectJson.awsRegions[0],
        });

        // Create REST API
        client.createRestApi({
          name:        JAWS._meta.projectJson.name,
          description: JAWS._meta.projectJson.description,
        }).then(function(response) {

          // Update Project's jaws.json
          JAWS._meta.projectJson.restApiId = response.id;
          fs.writeFileSync(path.join(JAWS._meta.projectRootPath, 'jaws.json'), JSON.stringify(JAWS._meta.projectJson, null, 2));
          resolve(response.id);
        });
      }
    });
  };

  JAWS._inspectLambdas = function() {
    
  }

  /**
   * Deploy API
   * @param stage
   * @returns {bluebird|exports|module.exports}
   */
  JAWS.deployApi = function(stage) {
    return this._findOrCreateRestApi();
  };
};
