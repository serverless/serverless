'use strict';

/**
 * JAWS Services: AWS: Lambda
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const Lambda = BbPromise.promisifyAll(new AWS.Lambda(config), { suffix: "Promised" });

  /**
   * Get Lambda Name
   */

  Lambda.sGetLambdaName = function(functionJson) {
    return functionJson.name;
  };

  // Return configured, customized instance
  return Lambda;

};
