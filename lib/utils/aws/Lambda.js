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
  
  Lambda.sValidLambdaRegions = [
    'us-east-1',
    'us-west-2',      // Oregon
    'eu-west-1',      // Ireland
    'ap-northeast-1', // Tokyo
  ];

  /**
   * Get Lambda Name
   */

  Lambda.sGetLambdaName = BbPromise.method(function(functionJson) {
    return functionJson.name;
  });

  // Return configured, customized instance
  return Lambda;

};
