'use strict';

/**
 * Serverless Services: AWS: Lambda
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    SError = require('../../ServerlessError'),
    SUtils = require('../../utils'),
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

  Lambda.sGetLambdaName = function(projectName, moduleName, functionName) {
    return projectName + '-' + moduleName + '-' + functionName;
  };

  /**
   * Retrns [{FunctionName: "", Version: "", FunctionArn: ""},...]
   * @param awsProfile
   * @param awsRegion
   * @param functionNames
   * @returns {BbPromise.<Array>}
   */
  Lambda.sPublishVersions = function(functionNames) {

    let d         = new Date(),
        ds        = `versioned at ${d}`,
        deferreds = [];

    functionNames.forEach(fn => {
      let params = {
        FunctionName: fn,
        Description:  ds,
      };

      SUtils.sDebug('Pushing version to publish: ', params);

      deferreds.push(Lambda.publishVersionPromised(params));
    });

    return BbPromise.all(deferreds)
      .then(data => {
        return data.map(d => {
          return {FunctionName: d.FunctionName, Version: d.Version, FunctionArn: d.FunctionArn};
        });
      })
      .catch(e => {
        if (e.code == 'ServiceUnavailableException') {
          console.error('ServiceUnavailableException when trying to version lambda.  This could mean you have not deployed the lambda since last time you published a version.');
        }

        throw e;
      });
  };

  Lambda.sCreateAlias = function(functionName, functionVersion, aliasName) {


    let d      = new Date(),
        params = {
          FunctionName:    functionName,
          FunctionVersion: functionVersion + '',
          Name:            aliasName,
          Description:     `aliased at ${d}`,
        };

    SUtils.sDebug('Creating alias', params);

    return Lambda.createAliasPromised(params)
      .then(d => {
        return {AliasArn: d.AliasArn, FunctionVersion: d.FunctionVersion};
      });
  };

  // Return configured, customized instance
  return Lambda;

};
