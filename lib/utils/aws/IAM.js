'use strict';

/**
 * Serverless Services: AWS: IAM
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    SError    = require('../../Error'),
    SUtils    = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

module.exports = function(config) {

  // Promisify and configure instance
  const IAM = BbPromise.promisifyAll(new AWS.IAM(config));

  /**
   * Get IAM Role
   */

  IAM.sGetRole = function(roleName) {
    let params = {
      RoleName: roleName,
    };
    return IAM.getRoleAsync(params)
      .error(function(error) {
        return BbPromise.reject(new SError(error.message, SError.errorCodes.UNKNOWN));
      });
  };

  // Return configured, customized instance
  return IAM;

};
