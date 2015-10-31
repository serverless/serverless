'use strict';

/**
 * JAWS Services: AWS
 */

let Promise   = require('bluebird'),
    AWS       = require('aws-sdk'),
    path      = require('path'),
    os        = require('os'),
    JawsError = require('../jaws-error/index'),
    JawsUtils = require('../utils'),
    async     = require('async'),
    fs        = require('fs');

Promise.promisifyAll(fs);

exports.validLambdaRegions = [
  'us-east-1',
  'us-west-2',      //Oregon
  'eu-west-1',      //Ireland
  'ap-northeast-1', //Tokyo
];

/**
 * Export Configured AWS SDK
 */
module.exports.aws = AWS;

/**
 * Set AWS SDK Creds and region from a given profile
 *
 * @param awsProfile
 * @param awsRegion
 */
module.exports.configAWS = function(awsProfile, awsRegion) {

  // Check Profile Exists
  this.profilesGet(awsProfile);

  // Set Credentials
  AWS.config.credentials = new AWS.SharedIniFileCredentials({
    profile: awsProfile,
  });

  // Set Region
  AWS.config.update({
    region: awsRegion,
  });
};

/**
 * Get the directory containing AWS configuration files
 *
 * @returns {string}
 */
module.exports.getConfigDir = function() {

  let env  = process.env;
  let home = env.HOME ||
    env.USERPROFILE ||
    (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

  if (!home) {
    throw new JawsError('Cant find homedir', JawsError.errorCodes.MISSING_HOMEDIR);
  }

  return path.join(home, '.aws');
};

/**
 * Gets a map of AWS profiles from ~/.aws/credentials
 *
 * @returns {*}
 */
module.exports.profilesMap = function() {
  let credsPath = path.join(this.getConfigDir(), 'credentials');
  return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
};

/**
 * Set a new AWS profile on the filesystem.
 *
 * Creates entry in ~/.aws/config and credentials
 *
 * @param awsProfile
 * @param awsRegion
 * @param accessKeyId
 * @param secretKey
 */
module.exports.profilesSet = function(awsProfile, awsRegion, accessKeyId, secretKey) {
  JawsUtils.jawsDebug('Setting new AWS profile:', awsProfile);
  let configDir  = this.getConfigDir(),
      credsPath  = path.join(configDir, 'credentials'),
      configPath = path.join(configDir, 'config');

  if (!JawsUtils.dirExistsSync(configDir)) {
    fs.mkdirSync(configDir, parseInt(0o700, 8));
  }

  fs.appendFileSync(
    credsPath,
    `[${awsProfile}]
aws_access_key_id = ${accessKeyId.trim()}
aws_secret_access_key = ${secretKey.trim()}\n`);

  let profileNameForConfig = (awsProfile == 'default') ? 'default' : 'profile ' + awsProfile;

  fs.appendFileSync(
    configPath,
    `[${profileNameForConfig}]
region = ${awsRegion}\n`);
};

/**
 * Get AWS profiles from the filesystem
 *
 * @param awsProfile
 * @returns {list} profiles
 */
module.exports.profilesGet = function(awsProfile) {
  let profiles = this.profilesMap();

  if (!profiles[awsProfile]) {
    throw new JawsError(`Cant find profile ${awsProfile} in ~/.aws/credentials`, awsProfile);
  }

  return profiles;
};

/**
 * IAM: Get role
 *
 * @param awsProfile
 * @param awsRegion
 * @param roleName
 * @returns {Promise}
 */

exports.iamGetRole = function(awsProfile, awsRegion, roleName) {
  let _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    let IAM = new AWS.IAM({
      apiVersion: '2010-05-08',
    });

    let params = {
      RoleName: roleName,
    };
    IAM.getRole(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  });
};

/**
 * CloudFormation: Describe Stack
 *
 * @param awsProfile
 * @param awsRegion
 * @param stackName
 * @returns {Promise}
 */

exports.cfDescribeStacks = function(awsProfile, awsRegion, stackName) {
  let _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    let CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    let params = {
      StackName: stackName,
    };
    CF.describeStacks(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }

    });
  });
};

/**
 * CloudFormation: Describe Stack Resource
 * @param awsProfile
 * @param awsRegion
 * @param stackId
 * @param cfResourceId
 * @returns {Promise}
 */

exports.cfDescribeStackResource = function(awsProfile, awsRegion, stackId, cfResourceId) {
  let _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    let CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    let params = {
      LogicalResourceId: cfResourceId,
      StackName:         stackId,
    };

    CF.describeStackResource(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  });
};

/**
 * CloudFormation: List Stack Resources
 *
 * @param awsProfile
 * @param awsRegion
 * @param stackName
 * @param nextToken
 * @returns {Promise}
 */
exports.cfListStackResources = function(awsProfile, awsRegion, stackName, nextToken) {

  this.configAWS(awsProfile, awsRegion);

  let CF = Promise.promisifyAll(new AWS.CloudFormation({
    apiVersion: '2010-05-15',
  }));

  let params = {
    StackName: stackName,
    NextToken: nextToken,
  };

  return CF.listStackResourcesAsync(params);
};

/**
 * Returns data like:
 * [
 {
   "LogicalResourceId": "lChannelWxLatlng",
   "PhysicalResourceId": "prod-pushChannelSearch-l-lChannelWxLatlng-AS845QCZ8J1L",
   "ResourceType": "AWS::Lambda::Function",
   "LastUpdatedTimestamp": "2015-10-15T19:06:55.134Z",
   "ResourceStatus": "UPDATE_COMPLETE"
 },
 {
   "LogicalResourceId": "lChannelWxTypeahead",
   "PhysicalResourceId": "prod-pushChannelSearch-l-lChannelWxTypeahead-15NUNJF0O22HA",
   "ResourceType": "AWS::Lambda::Function",
   "LastUpdatedTimestamp": "2015-10-19T21:35:24.357Z",
   "ResourceStatus": "UPDATE_COMPLETE"
 }
 ]

 * @param awsProfile
 * @param awsRegion
 * @param stackName
 * @returns {Promise.<array>}
 */
exports.cfGetLambdaResourceSummaries = function(awsProfile, awsRegion, stackName) {
  let _this         = this,
      moreResources = true,
      nextStackToken,
      lambdas       = [];

  return new Promise((resolve, reject)=> {
    async.whilst(
      function() {
        return moreResources === true;
      },
      function(callback) {
        _this.cfListStackResources(awsProfile, awsRegion, stackName, nextStackToken)
          .then(function(lambdaCfResources) {
            if (lambdaCfResources.StackResourceSummaries) {
              lambdas = lambdas.concat(lambdaCfResources.StackResourceSummaries);
            }

            // Check if more resources are available
            if (!lambdaCfResources.NextToken) {
              moreResources = false;
            } else {
              nextStackToken = lambdaCfResources.NextToken;
            }

            callback();
          })
          .catch(function(error) {
            console.log('Warning: JAWS could not find a deployed Cloudformation '
              + 'template containing lambda functions.');
            console.log(error);
            moreResources = false;
            callback(error);
          });
      },
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(lambdas);
        }
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
exports.cfGetLambdaPhysicalsFromLogicals = function(logicalIds, lambdaResourceSummaries) {
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
 * Retrns [{FunctionName: "", Version: "", FunctionArn: ""},...]
 * @param awsProfile
 * @param awsRegion
 * @param functionNames
 * @returns {Promise.<Array>}
 */
exports.lambdaPublishVersions = function(awsProfile, awsRegion, functionNames) {
  this.configAWS(awsProfile, awsRegion);

  let L                   = new AWS.Lambda({
        apiVersion: '2015-03-31',
      }),
      publishVersionAsync = Promise.promisify(L.publishVersion, L);

  let d         = new Date(),
      ds        = `versioned at ${d}`,
      deferreds = [];

  functionNames.forEach(fn => {
    let params = {
      FunctionName: fn,
      Description:  ds,
    };

    JawsUtils.jawsDebug('Pushing version to publish: ', params);

    deferreds.push(publishVersionAsync(params));
  });

  return Promise.all(deferreds)
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

/**
 * Alias a lambda given a version and function name
 *
 * Retrns {AliasArn: "", FunctionVersion: ""}
 *
 * @param awsProfile
 * @param awsRegion
 * @param functionName
 * @param functionVersion
 * @param aliasName
 * @returns {Promise}
 */
exports.lambdaCreateAlias = function(awsProfile, awsRegion, functionName, functionVersion, aliasName) {
  this.configAWS(awsProfile, awsRegion);

  let L                = new AWS.Lambda({
        apiVersion: '2015-03-31',
      }),
      createAliasAsync = Promise.promisify(L.createAlias, L);

  let d      = new Date(),
      params = {
        FunctionName:    functionName,
        FunctionVersion: functionVersion + '',
        Name:            aliasName,
        Description:     `aliased at ${d}`,
      };

  JawsUtils.jawsDebug('Creating alias', params);

  return createAliasAsync(params)
    .then(d => {
      return {AliasArn: d.AliasArn, FunctionVersion: d.FunctionVersion};
    });
};

/**
 * Get the greatest version for a lambda or $LATEST if no version
 *
 * @param awsProfile
 * @param awsRegion
 * @param functionName
 * @returns {Promise.<string>}
 */
exports.lambdaGetGreatestVersion = function(awsProfile, awsRegion, functionName) {
  this.configAWS(awsProfile, awsRegion);

  let _this                       = this,
      moreResources               = true,
      nextToken,
      versions                    = [],
      L                           = new AWS.Lambda({
        apiVersion: '2015-03-31',
      }),
      listVersionsByFunctionAsync = Promise.promisify(L.listVersionsByFunction, L);

  let params = {
    FunctionName: functionName,
  };

  //Freaking listVersionsByFunction returns them ASC !!!! REALLY!?!?
  return new Promise((resolve, reject)=> {
    async.whilst(
      function() {
        return moreResources === true;
      },
      function(callback) {

        if (nextToken) {
          params.Marker = nextToken;
        }

        return listVersionsByFunctionAsync(params)
          .then(d => {
            JawsUtils.jawsDebug(`Function versions for ${functionName}`, d);

            versions = versions.concat(d.Versions);

            // Check if more resources are available
            if (!d.NextMarker) {
              moreResources = false;
            } else {
              nextToken = d.NextMarker;
            }

            callback();
          })
          .catch(function(error) {
            console.error(error);
            moreResources = false;
            callback(error);
          });
      },
      function(err) {
        if (err) {
          reject(err);
        } else {
          let greatestVer = false;

          versions.forEach(oVersions => {
            let verInt = parseInt(oVersions.Version);
            if (oVersions.Version !== '$LATEST' && verInt > greatestVer) {
              greatestVer = verInt;
            }
          });

          greatestVer = (greatestVer) ? '' + greatestVer : '$LATEST';

          JawsUtils.jawsDebug(`Latest version for ${functionName}`, greatestVer);

          resolve(greatestVer);
        }
      }
    );
  });
};

/**
 * CloudFormation: Get Resources Stack Name
 * @param stage
 * @param projName
 * @returns {string}
 */

exports.cfGetResourcesStackName = function(stage, projName) {
  return [stage, projName, 'r'].join('-'); // stack names are alphanumeric + -, no _ :(
};

/**
 * CloudFormation: Get Lambdas Stack Name
 * @param stage
 * @param projName
 * @returns {string}
 */

exports.cfGetLambdasStackName = function(stage, projName) {
  return [stage, projName, 'l'].join('-'); // stack names are alphanumeric + -, no _ :(
};

/**
 * CloudFormation: Get existing lambdas stack template body
 *
 * @param awsProfile
 * @param awsRegion
 * @param stage
 * @param projName
 * @returns {Promise} string of JSON template body
 */

exports.cfGetLambdasStackTemplate = function(awsProfile, awsRegion, stage, projName) {
  let _this = this;

  _this.configAWS(awsProfile, awsRegion);

  let CF = Promise.promisifyAll(new AWS.CloudFormation({
    apiVersion: '2010-05-15',
  }));

  return CF.getTemplateAsync({
      StackName: _this.cfGetLambdasStackName(stage, projName),
    })
    .then(function(data) {
      return data.TemplateBody;
    });
};

/**
 * S3: CF File On S3
 * @param awsProfile
 * @param projRootPath
 * @param awsRegion
 * @param bucketName
 * @param projName
 * @param projStage
 * @param type
 * @returns {*}
 */

exports.putCfFile = function(awsProfile, projRootPath, awsRegion, bucketName, projName, projStage, type) {
  if (['lambdas', 'resources'].indexOf(type) == -1) {
    Promise.reject(new JawsError(`Type ${type} invalid. Must be lambdas or resources`, JawsError.errorCodes.UNKNOWN));
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

  return this.putS3Object(awsProfile, awsRegion, params)
    .then(function() {
      //Really AWS - TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
      let s3 = new AWS.S3();

      //Seriously, not cool...
      return 'https://' + s3.endpoint.hostname + `/${bucketName}/${key}`;
    });
};

/**
 * CloudFormation: Create Lambdas Stack
 * @param JAWS
 * @param stage
 * @param region
 * @param lambdaRoleArn
 * @returns {*}
 */

exports.cfCreateLambdasStack = function(JAWS, stage, region, lambdaRoleArn) {
  let _this        = this,
      awsProfile   = JAWS._awsProfile,
      projRootPath = JAWS._projectRootPath,
      bucketName   = JAWS.getJawsBucket(region, stage),
      projName     = JAWS._projectJson.name;

  _this.configAWS(awsProfile, region);

  let CF        = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetLambdasStackName(stage, projName);

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

  return _this.putCfFile(awsProfile, projRootPath, region, bucketName, projName, stage, 'lambdas')
    .then(function(templateUrl) {
      params.TemplateURL = templateUrl;
      return CF.createStackAsync(params);
    });
};

/**
 * CloudFormation: Update Lambdas Stack
 * @param JAWS
 * @param stage
 * @param region
 * @param lambdaRoleArn
 * @returns {*}
 */

exports.cfUpdateLambdasStack = function(JAWS, stage, region, lambdaRoleArn) {
  let _this        = this,
      awsProfile   = JAWS._awsProfile,
      projRootPath = JAWS._projectRootPath,
      bucketName   = JAWS.getJawsBucket(region, stage),
      projName     = JAWS._projectJson.name;

  _this.configAWS(awsProfile, region);

  let CF        = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetLambdasStackName(stage, projName);

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

  return _this.putCfFile(awsProfile, projRootPath, region, bucketName, projName, stage, 'lambdas')
    .then(function(templateUrl) {
      params.TemplateURL = templateUrl;
      return CF.updateStackAsync(params);
    });
};

/**
 * CloudFormation: Create Resources Stack
 *
 * @param awsProfile
 * @param awsRegion
 * @param projRootPath
 * @param projName
 * @param projStage
 * @param projDomain
 * @param projNotificationEmail
 * @param templateUrl
 * @returns {Promise}
 */
exports.cfCreateResourcesStack = function(awsProfile,
                                          awsRegion,
                                          projRootPath,
                                          projName,
                                          projStage,
                                          projDomain,
                                          projNotificationEmail,
                                          templateUrl) {

  let _this = this;

  _this.configAWS(awsProfile, awsRegion);

  let CF = Promise.promisifyAll(new AWS.CloudFormation({
    apiVersion: '2010-05-15',
  }));

  let stackName = _this.cfGetResourcesStackName(projStage, projName);

  let params = {
    StackName:    stackName,
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
  return CF.createStackAsync(params);

};

/**
 * CloudFormation: Update Resources Stack
 * @param JAWS
 * @param stage
 * @param region
 * @returns {Promise}
 */
exports.cfUpdateResourcesStack = function(JAWS, stage, region) {

  let _this        = this,
      awsProfile   = JAWS._awsProfile,
      projRootPath = JAWS._projectRootPath,
      bucketName   = JAWS.getJawsBucket(region, stage),
      projName     = JAWS._projectJson.name;

  _this.configAWS(awsProfile, region);

  let CF        = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetResourcesStackName(stage, projName);

  let params = {
    StackName:           stackName,
    Capabilities:        [
      'CAPABILITY_IAM',
    ],
    UsePreviousTemplate: false,
    Parameters:          [],
  };

  return _this.putCfFile(awsProfile, projRootPath, region, bucketName, projName, stage, 'resources')
    .then(function(templateUrl) {
      params.TemplateURL = templateUrl;
      return CF.updateStackAsync(params);
    });
};

/**
 * CloudFormation: Monitor CF Stack Status (Create/Update)
 * @param cfData
 * @param awsProfile
 * @param region
 * @param createOrUpdate create|update
 * @param checkFreq default 5000 ms
 * @returns {Promise} when cf has completed successfully or with an error
 */

exports.monitorCf = function(cfData, awsProfile, region, createOrUpdate, checkFreq) {
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
    Promise.reject(new JawsError('Must specify create or update', JawsError.errorCodes.UNKNOWN));
  }

  return new Promise(function(resolve, reject) {

    let stackStatus = null,
        stackData   = null;

    async.whilst(
      function() {
        return stackStatus !== stackStatusComplete;
      },

      function(callback) {
        setTimeout(function() {
          _this.cfDescribeStacks(awsProfile, region, cfData.StackId)
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

/**
 * S3: Create Bucket
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @returns {Promise}
 */
exports.createBucket = function(awsProfile, awsRegion, bucketName) {
  this.configAWS(awsProfile, awsRegion);

  let s3 = Promise.promisifyAll(new AWS.S3());

  return s3.getBucketAclAsync({Bucket: bucketName})
    .then(function() {
      //we are good, bucket already exists and we own it!
    })
    .error(function(err) {
      if (err.code == 'AccessDenied') {
        throw new JawsError(
          `Bucket ${bucketName} already exists and you do not have permissions to use it`,
          JawsError.errorCodes.ACCESS_DENIED
        );
      }

      return s3.createBucketAsync({
        Bucket: bucketName,
        ACL:    'private',
      });
    });
};

/**
 * S3: Put Object
 * @param awsProfile
 * @param awsRegion
 * @param params
 * @returns {Promise}
 */

exports.putS3Object = function(awsProfile, awsRegion, params) {
  this.configAWS(awsProfile, awsRegion);
  let s3 = Promise.promisifyAll(new AWS.S3());
  return s3.putObjectAsync(params);
};

/**
 * Uploads an arbitrarily sized buffer, blob, or stream, using intelligent concurrent handling of parts if the payload is large enough
 *
 * @param awsProfile
 * @param awsRegion
 * @param params
 * @returns {Promise}
 */
exports.s3Upload = function(awsProfile, awsRegion, params) {
  this.configAWS(awsProfile, awsRegion);
  let s3 = Promise.promisifyAll(new AWS.S3());
  return s3.uploadAsync(params);
};

/**
 * S3: Get Object
 * @param awsProfile
 * @param awsRegion
 * @param params
 * @returns {Promise} s3 data object response
 */

exports.getS3Object = function(awsProfile, awsRegion, params) {
  this.configAWS(awsProfile, awsRegion);
  let s3 = Promise.promisifyAll(new AWS.S3());
  return s3.getObjectAsync(params);
};

/**
 * S3: Get the env file for a given stage
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @param projectName
 * @param stage
 * @returns {Promise} s3 data object response
 */

exports.getEnvFile = function(awsProfile, awsRegion, bucketName, projectName, stage) {
  let key    = ['JAWS', projectName, stage, 'envVars', '.env'].join('/'),
      params = {
        Bucket: bucketName,
        Key:    key,
      };

  JawsUtils.jawsDebug(`env get s3 bucket: ${bucketName} key: ${key}`);
  return this.getS3Object(awsProfile, awsRegion, params);
};

/**
 * S3: Put up the env file for a given stage
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @param projectName
 * @param stage
 */

exports.putEnvFile = function(awsProfile, awsRegion, bucketName, projectName, stage, contents) {
  let params = {
    Bucket:      bucketName,
    Key:         ['JAWS', projectName, stage, 'envVars', '.env'].join('/'),
    ACL:         'private',
    ContentType: 'text/plain',
    Body:        contents,
  };

  return this.putS3Object(awsProfile, awsRegion, params);
};

/**
 * S3: Put up deployment zip for a given stage
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @param projectName
 * @param stage
 * @param lambdaName
 * @param body Buffer, Typed Array, Blob, String, ReadableStream
 * @returns {Promise} key of zip file in s3
 */

exports.putLambdaZip = function(awsProfile, awsRegion, bucketName, projectName, stage, lambdaName, body) {
  let d      = new Date(),
      key    = ['JAWS', projectName, stage, 'lambdas', lambdaName + '@' + d.getTime() + '.zip'].join('/'),
      params = {
        Bucket:      bucketName,
        Key:         key,
        ACL:         'private',
        ContentType: 'application/zip',
        Body:        body,
      };

  JawsUtils.jawsDebug(`lambda zip s3 key: ${key}`);

  return this.s3Upload(awsProfile, awsRegion, params)
    .then(function() {
      return key;
    });
};

/**
 * CloudWatchLogs: Get Log Streams
 * @param logGroupName
 * @param limit
 * @returns {Promise}
 */

exports.cwGetLogStreams = function(logGroupName, limit) {
  return new Promise(function(resolve, reject) {

    // Instantiate
    let cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
    });

    let params = {
      logGroupName: logGroupName,
      descending:   true,
      limit:        limit || 5,
      orderBy:      'LastEventTime',
    };

    cwLogs.describeLogStreams(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  });
};

/**
 * CloudWatchLogs: Get Log Stream Events
 * @param logGroupName
 * @param logStreamName
 * @returns {Promise}
 */

exports.cwGetStreamEvents = function(logGroupName, logStreamName) {
  return new Promise(function(resolve, reject) {

    // Instantiate
    let cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
    });

    let params = {
      logGroupName:  logGroupName,
      logStreamName: logStreamName,
    };

    cwLogs.getLogEvents(params, function(err, data) {
      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  });
};

/**
 * Lambda: List Functions
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @returns {*}
 */

exports.lambdaListFunctions = function(awsProfile, awsRegion) {
  this.configAWS(awsProfile, awsRegion);

  let lambda = new AWS.Lambda();

  let params = {};

  return new Promise(function(resolve, reject) {
    lambda.listFunctions(params, function(err, data) {

      if (err) {
        return reject(err);
      }

      return resolve(data);

    });
  });
};

/**
 * Lambda: Get Policy
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @returns {*}
 */

exports.lambdaGetPolicy = function(awsProfile, awsRegion, functionName) {
  this.configAWS(awsProfile, awsRegion);

  let lambda = new AWS.Lambda();

  let params = {
    FunctionName: functionName.trim(),
  };

  return new Promise(function(resolve, reject) {
    lambda.getPolicy(params, function(err, data) {

      if (err) {
        return reject(err);
      }

      return resolve(data);

    });
  });
};

/**
 * Lambda: Add Permission
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @returns {*}
 */

exports.lambdaAddPermission = function(awsProfile, awsRegion, permissionStatement) {
  this.configAWS(awsProfile, awsRegion);

  let lambda = new AWS.Lambda();

  return new Promise(function(resolve, reject) {
    lambda.addPermission(permissionStatement, function(err, data) {

      if (err) {
        return reject(err);
      }

      return resolve(data);

    });
  });
};

/**
 * Lambda: Remove Permission
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @returns {*}
 */

exports.lambdaRemovePermission = function(awsProfile, awsRegion, functionName, statementId) {
  this.configAWS(awsProfile, awsRegion);

  let lambda = new AWS.Lambda();

  let params = {
    FunctionName: functionName, /* required */
    StatementId:  statementId, /* required */
  };

  return new Promise(function(resolve, reject) {
    lambda.removePermission(params, function(err, data) {

      if (err) {
        return reject(err);
      }

      return resolve(data);

    });
  });
};

