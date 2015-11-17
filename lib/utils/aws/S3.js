'use strict';

/**
 * JAWS Services: AWS: S3
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    async     = require('async'),
    AWS       = require('aws-sdk'),
    JawsUtils = require('../../utils'),
    JawsError = require('../../jaws-error'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);


module.exports = function(config) {

  // Promisify and configure instance
  const S3 = BbPromise.promisifyAll(new AWS.S3(config));
  
  
  // Return configured, customized instance
  return S3;

};
