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
  const CloudFormation = BbPromise.promisifyAll(new AWS.CloudFormation(config), { suffix: "Promised" });

  /**
   * Get Lambdas Stack Name
   */

  CloudFormation.sGetLambdasStackName = function(stage, projName) {
    return [stage, projName, 'l'].join('-'); // stack names are alphanumeric + -, no _ :(
  };

  /**
   * Get Resources Stack Name
   */

  CloudFormation.sGetResourcesStackName = function(stage, projName) {
    let name = [stage, projName, 'r'].join('-');
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
   * Put CF File On S3
   */

  CloudFormation.sPutCfFile = function(projRootPath, bucketName, projName, projStage, type) {

    let S3 = require('./S3')(config);

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

    return S3.putObjectPromised(params)
      .then(function() {

        // TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
        let s3 = new AWS.S3();
        return 'https://' + s3.endpoint.hostname + `/${bucketName}/${key}`;
      });
  };
  
  /**
   * Create Lambdas Stack
   */

  CloudFormation.sCreateLambdasStack = function(JAWS, stage, region) {

    let _this        = this,
        projRootPath = JAWS._projectRootPath,
        projName     = JAWS._projectJson.name,
        regionJson   = JawsUtils.getProjRegionConfigForStage(
            JAWS._projectJson,
            stage,
            region);

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:    stackName,
      Capabilities: [],
      OnFailure:    'ROLLBACK',
      Parameters:   [{
        ParameterKey:     'aaLambdaRoleArn',
        ParameterValue:   regionJson.iamRoleArnLambda,
        UsePreviousValue: false,
      },],
      Tags:         [{
        Key:   'STAGE',
        Value: stage,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, regionJson.regionBucket, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.createStackPromised(params);
      });
  };
  
  /**
   * Update Lambdas Stack
   */

  CloudFormation.sUpdateLambdasStack = function(JAWS, stage, region) {

    let _this        = this,
        projRootPath = JAWS._projectRootPath,
        projName     = JAWS._projectJson.name,
        regionJson   = JawsUtils.getProjRegionConfigForStage(JAWS._projectJson, stage, region);

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:           stackName,
      Capabilities:        [],
      UsePreviousTemplate: false,
      Parameters:          [{
        ParameterKey:      'aaLambdaRoleArn',
        ParameterValue:    regionJson.iamRoleArnLambda,
        UsePreviousValue:  false,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, regionJson.regionBucket, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.updateStackPromised(params);
      });
  };
  
  /**
   * Create Resources Stack
   */

  CloudFormation.sCreateResourcesStack = function(
                                            projRootPath,
                                            projName,
                                            projStage,
                                            projDomain,
                                            projNotificationEmail,
                                            templateUrl) {

    let _this = this;
    let stackName = CloudFormation.sGetResourcesStackName(projStage, projName);
    let params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      TemplateURL:  templateUrl,
      OnFailure:    'ROLLBACK',
      Parameters:   [{
        ParameterKey:     'aaProjectName',
        ParameterValue:   projName,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'aaStage',
        ParameterValue:   projStage,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'aaDataModelStage',
        ParameterValue:   projStage,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'aaProjectDomain',
        ParameterValue:   projDomain,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'aaNotficationEmail',
        ParameterValue:   projNotificationEmail,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'aaDefaultDynamoRWThroughput',
        ParameterValue:   '1',
        UsePreviousValue: false,
      },],
      Tags:         [{
        Key:   'STAGE',
        Value: projStage,
      },],
    };

    // Create CloudFormation Stack
    return CloudFormation.createStackPromised(params);
  };
  
  /**
   * Update Resources Stack
   */

  CloudFormation.sUpdateResourcesStack = function(JAWS, stage, region) {

    let _this        = this,
        projRootPath = JAWS._projectRootPath,
        bucketName   = JawsUtils.getProjRegionConfigForStage(JAWS._projectJson, stage, region).regionBucket,
        projName     = JAWS._projectJson.name;


    let stackName = CloudFormation.sGetResourcesStackName(stage, projName);

    let params = {
      StackName:           stackName,
      Capabilities:        [
        'CAPABILITY_IAM',
      ],
      UsePreviousTemplate: false,
      Parameters:          [
        {
        ParameterKey:     'aaStage',
        ParameterValue:   stage,
        UsePreviousValue: false,
        }, {
          ParameterKey:     'aaDataModelStage',
          ParameterValue:   stage,
          UsePreviousValue: false,
        },
      ],
    };

    return CloudFormation.sPutCfFile(projRootPath, bucketName, projName, stage, 'resources')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.updateStackPromised(params);
      });
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
      BbPromise.reject(new JawsError('Must specify create or update', JawsError.errorCodes.UNKNOWN));
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

                JawsUtils.jawsDebug('CF stack status: ', stackStatus);

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  console.log((data.Stacks && data.Stacks.length ? data.Stacks[0] : data));
                  return reject(new JawsError(
                    `Something went wrong while ${createOrUpdate}ing your cloudformation`));
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
