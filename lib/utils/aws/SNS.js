'use strict';

/**
 * Serverless Services: AWS: SNS
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    AWS       = require('aws-sdk'),
    fs        = require('fs');

BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const SNS = BbPromise.promisifyAll(new AWS.SNS(config), { suffix: "Promised" });

  // Return configured, customized instance
  return SNS;

};
