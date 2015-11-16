'use strict';

/**
 * JAWS Services: AWS: CloudFormation
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

/**
 * Export
 */

module.exports = function(config) {

  // Promisify and configure instance
  const CloudFormation = BbPromise.promisifyAll(new AWS.CloudFormation(config));

  /**
   * Get Lambdas Stack Name
   */

  CloudFormation.sGetLambdasStackName = BbPromise.method(function(stage, projName) {
    return [stage, projName, 'l'].join('-'); // stack names are alphanumeric + -, no _ :(
  });

  /**
   * Get Resources Stack Name
   */

  CloudFormation.sGetResourcesStackName = BbPromise.method(function(stage, projName) {
    return [stage, projName, 'r'].join('-'); // stack names are alphanumeric + -, no _ :(
  });

  /**
   * Get Lambda Resource Summaries
   */

  CloudFormation.sGetLambdaResourceSummaries = function(stackName) {

    let moreResources = true,
        nextStackToken,
        lambdas       = [];

    return new BbPromise(function(resolve, reject) {

      async.whilst(
          function () {
            return moreResources === true;
          },
          function (callback) {

            let params = {
              StackName: stackName,
              NextToken: nextStackToken
            };

            return CloudFormation.listStackResourcesAsync(params)
                .then(function (lambdaCfResources) {

                  if (lambdaCfResources.StackResourceSummaries) {
                    lambdas = lambdas.concat(lambdaCfResources.StackResourceSummaries);
                  }

                  // Check if more resources are available
                  if (!lambdaCfResources.NextToken) {
                    moreResources = false;
                  } else {
                    nextStackToken = lambdaCfResources.NextToken;
                  }

                  return callback();
                })
                .catch(function (error) {

                  if (error.message && error.message.indexOf('does not exist') !== -1) {
                    return reject(new JawsError(error.message));
                  }

                  moreResources = false;
                  return callback();
                });
          },
          function () {
            return resolve(lambdas);
          }
      );
    });
  };

  // Return configured, customized instance
  return CloudFormation;

};