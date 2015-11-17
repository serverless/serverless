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
  
  /**
   * Given a list of lambda LogicalResourceId's and a list of lambdaResourceSummaries
   * return a corresponding list of lambda PhysicalResourceId's
   *
   * @param logicalIds
   * @param lambdaResourceSummaries
   */
   
  CloudFormation.sGetLambdaPhysicalsFromLogicals = function(logicalIds, lambdaResourceSummaries) {
    let lambdaPhysicalIds = [];
    for (let lid of logicalIds) {
      let foundLambda = lambdaResourceSummaries.find(element=> {
        return element.LogicalResourceId == lid;
      });

      if (!foundLambda) {
        throw new JawsError(`unable to find lambda with logical id ${lid}`, JawsError.errorCodes.UNKNOWN);
      }

      lambdaPhysicalIds.push(foundLambda.PhysicalResourceId);
    }

    return lambdaPhysicalIds;
  };
  
  /**
   * Put CF File On S3
   * @param awsProfile
   * @param projRootPath
   * @param awsRegion
   * @param bucketName
   * @param projName
   * @param projStage
   * @param type
   * @returns {*}
   */
  CloudFormation.sPutCfFile = function(projRootPath, bucketName, projName, projStage, type) {
    if (['lambdas', 'resources'].indexOf(type) == -1) {
      BbPromise.reject(new JawsError(`Type ${type} invalid. Must be lambdas or resources`, JawsError.errorCodes.UNKNOWN));
    }

    let d      = new Date(),
        cfPath = path.join(projRootPath, 'cloudformation', type + '-cf.json'),
        key    = ['JAWS', projName, projStage, 'cloudformation/' + type].join('/') + '@' + d.getTime() + '.json',
        params = {
          Bucket:      bucketName,
          Key:         key,
          ACL:         'private',
          ContentType: 'application/json',
          Body:        fs.readFileSync(cfPath),
        };
    S3 = require('./S3')(config);
    
    return S3.putObjectAsync(params)
      .then(function() {
        //Really AWS - TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
        let s3 = new AWS.S3();

        //Seriously, not cool...
        return 'https://' + s3.endpoint.hostname + `/${bucketName}/${key}`;
      });
  };
  
  /**
   * Create Lambdas Stack
   * @param JAWS
   * @param stage
   * @param lambdaRoleArn
   * @returns {*}
   */
  CloudFormation.sCreateLambdasStack = function(JAWS, stage, lambdaRoleArn) {
    let _this        = this,
        projRootPath = JAWS._projectRootPath,
        bucketName   = JAWS.getJawsBucket(config.region, stage),
        projName     = JAWS._projectJson.name;

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:    stackName,
      Capabilities: [],
      OnFailure:    'ROLLBACK',
      Parameters:   [{
        ParameterKey:     'aaLambdaRoleArn',
        ParameterValue:   lambdaRoleArn,
        UsePreviousValue: false,
      },],
      Tags:         [{
        Key:   'STAGE',
        Value: stage,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, bucketName, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.createStackAsync(params);
      });
  };
  
  /**
   * Update Lambdas Stack
   * @param JAWS
   * @param stage
   * @param region
   * @param lambdaRoleArn
   * @returns {*}
   */
  CloudFormation.sUpdateLambdasStack = function(JAWS, stage, lambdaRoleArn) {
    let _this        = this,
        projRootPath = JAWS._projectRootPath,
        bucketName   = JAWS.getJawsBucket(config.region, stage),
        projName     = JAWS._projectJson.name;

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:           stackName,
      Capabilities:        [],
      UsePreviousTemplate: false,
      Parameters:          [{
        ParameterKey:     'aaLambdaRoleArn',
        ParameterValue:   lambdaRoleArn,
        UsePreviousValue: false,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, bucketName, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.updateStackAsync(params);
      });
  };
  
  // Return configured, customized instance
  return CloudFormation;

};
