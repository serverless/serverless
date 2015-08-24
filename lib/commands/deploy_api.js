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



function _createRestApi() {

  // Get AWS profile credentials
  var profile = AWSUtils.profilesGet(project.awsProfile);

  //  Instantiate JawsApiGatewayClient
  var client = new JawsAPIClient({
    accessKeyId: profile[project.awsProfile].aws_access_key_id,
    secretAccessKey: profile[project.awsProfile].aws_secret_access_key,
    region: project.regions[0],
  });

  return client.createRestApi({
    name: project.name,
    description: 'REST API for ' + project.name,
  });
}


module.exports = function(JAWS) {
  JAWS.deployApi = function(stage) {


  };
};
