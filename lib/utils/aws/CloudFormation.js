'use strict';

/**
 * Serverless Services: AWS: CloudFormation
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
  path      = require('path'),
  os        = require('os'),
  async     = require('async'),
  AWS       = require('aws-sdk'),
  SUtils    = require('../../utils'),
  SError    = require('../../ServerlessError'),
  fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

/**
 * Export
 */

module.exports = function(config) {

  // Promisify and configure instance
  const CloudFormation = BbPromise.promisifyAll(new AWS.CloudFormation(config), { suffix: "Promised" });

  /**
   * Get Lambdas Stack Name
   */

  CloudFormation.sGetLambdasStackName = function(stage, projName) {
    return [projName, stage, 'l'].join('-'); // stack names are alphanumeric + -, no _ :(
  };

  /**
   * Get Resources Stack Name
   */

  CloudFormation.sGetResourcesStackName = function(stage, projName) {
    let name = [projName, stage, 'r'].join('-');
    return name; // stack names are alphanumeric + -, no _
  };

  /**
   * Get Lambda Resource Summaries
   */

  CloudFormation.sGetLambdaResourceSummaries = function(stackName) {

    let moreResources = true,
      nextStackToken,
      lambdas       = [];

    return new BbPromise(function(resolve, reject) {

      // Use whilst in case subsequent calls have to be made to paginate resources
      async.whilst(
        function () {
          return moreResources === true;
        },
        function (callback) {

          let params = {
            StackName: stackName,
            NextToken: nextStackToken ? nextStackToken : null,
          };

          return CloudFormation.listStackResourcesPromised(params)
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
                return reject(new SError(error.message));
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

  /**
   * Get Lambda PHysical ID From Logical
   * @param logicalIds
   * @param lambdaResourceSummaries
   * @returns {Array}
   */

  CloudFormation.sGetLambdaPhysicalsFromLogicals = function(logicalIds, lambdaResourceSummaries) {

    let lambdaPhysicalIds = [];
    for (let lid of logicalIds) {
      let foundLambda = lambdaResourceSummaries.find(element=> {
        return element.LogicalResourceId == lid;
      });

      if (!foundLambda) {
        throw new SError(`unable to find lambda with logical id ${lid}`, SError.errorCodes.UNKNOWN);
      }

      lambdaPhysicalIds.push(foundLambda.PhysicalResourceId);
    }

    return lambdaPhysicalIds;
  };

  /**
   * Create Or Update Resources Stack
   */

  CloudFormation.sCreateOrUpdateResourcesStack = function(project, stage, region, stackName, templateUrl) {

    let _this = this;

    // CF Params
    let params = {
      Capabilities:        [
        'CAPABILITY_IAM'
      ],
      Parameters: [],
      Tags: [{
        Key:   'STAGE',
        Value: stage
      }],
      TemplateURL: templateUrl
    };

    // Create or Update
    if (!stackName) {

      params.StackName = CloudFormation.sGetResourcesStackName(stage, project);
      params.OnFailure = 'DELETE';
      return CloudFormation.createStackPromised(params);

    } else if (type == 'update') {

      params.StackName = stackName;
      params.OnFailure = 'ROLLBACK';
      return CloudFormation.updateStackPromised(params);
    }
  };

  /**
   * Monitor CF Stack Status (Create/Update)
   */

  CloudFormation.sMonitorCf = function(cfData, createOrUpdate, checkFreq) {

    let _this = this,
      stackStatusComplete,
      validStatuses;

    if (!checkFreq) checkFreq = 5000;

    if (createOrUpdate == 'create') {
      stackStatusComplete = 'CREATE_COMPLETE';
      validStatuses       = ['CREATE_IN_PROGRESS', stackStatusComplete];
    } else if (createOrUpdate == 'update') {
      stackStatusComplete = 'UPDATE_COMPLETE';
      validStatuses       = ['UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', stackStatusComplete];
    } else {
      BbPromise.reject(new SError('Must specify create or update', SError.errorCodes.UNKNOWN));
    }

    return new BbPromise(function(resolve, reject) {

      let stackStatus = null,
        stackData   = null;

      async.whilst(
        function() {
          return stackStatus !== stackStatusComplete;
        },

        function(callback) {
          setTimeout(function() {
            let params = {
              StackName: cfData.StackId,
            };
            CloudFormation.describeStacksPromised(params)
              .then(function(data) {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                SUtils.sDebug('CF stack status: ', stackStatus);

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  let prefix = createOrUpdate.slice(0,-1);
                  return reject(new SError(
                    `Something went wrong while ${prefix}ing your cloudformation`));
                } else {
                  return callback();
                }
              });
          }, checkFreq);
        },

        function() {
          return resolve(stackData.Stacks[0]);
        }
      );
    });

  };

  // Return configured, customized instance
  return CloudFormation;
};
