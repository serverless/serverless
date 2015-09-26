'use strict';

/**
 * JAWS Services: AWS
 */

var Promise = require('bluebird'),
    AWS = require('aws-sdk'),
    path = require('path'),
    os = require('os'),
    JawsError = require('../jaws-error/index'),
    utils = require('../utils'),
    async = require('async'),
    fs = require('fs');

Promise.promisifyAll(fs);

exports.validLambdaRegions = [
  'us-east-1',
  'us-west-2',  //oregon
  'eu-west-1',  //Ireland
  'ap-northeast-1', //Tokyo
];

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

  var env = process.env;
  var home = env.HOME ||
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
  var credsPath = path.join(this.getConfigDir(), 'credentials');
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
  utils.jawsDebug('Setting new AWS profile:', awsProfile);
  var configDir = this.getConfigDir(),
      credsPath = path.join(configDir, 'credentials'),
      configPath = path.join(configDir, 'config');

  if (!utils.dirExistsSync(configDir)) {
    fs.mkdirSync(configDir, parseInt('0700', 8));  //change to 0o700 in es6
  }

  fs.appendFileSync(
      credsPath,
      '[' + awsProfile + ']' + os.EOL +
      'aws_access_key_id = ' + accessKeyId.trim() + os.EOL +
      'aws_secret_access_key = ' + secretKey.trim() + os.EOL);

  var profileNameForConfig = (awsProfile == 'default') ? 'default' : 'profile ' + awsProfile;

  fs.appendFileSync(
      configPath,
      '[' + profileNameForConfig + ']' + os.EOL +
      'region = ' + awsRegion + os.EOL);
};

/**
 * Get AWS profiles from the filesystem
 *
 * @param awsProfile
 * @returns {list} profiles
 */
module.exports.profilesGet = function(awsProfile) {
  var profiles = this.profilesMap();

  if (!profiles[awsProfile]) {
    throw new JawsError('Cant find profile ' + awsProfile + ' in ~/.aws/credentials', awsProfile);
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
  var _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    var IAM = new AWS.IAM({
      apiVersion: '2010-05-08',
    });

    var params = {
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
  var _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    var params = {
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
  var _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    var params = {
      LogicalResourceId: cfResourceId,
      StackName: stackId,
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
 * @param awsProfile
 * @param awsRegion
 * @param stackName
 * @param cfResourceId
 * @returns {Promise}
 */

exports.cfListStackResources = function(awsProfile, awsRegion, stackName, nextToken) {
  var _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    var CF = Promise.promisifyAll(new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    }));

    var params = {
      StackName: stackName,
      NextToken: nextToken,
    };

    return CF.listStackResources(params, function(error, data) {

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
  var _this = this;

  _this.configAWS(awsProfile, awsRegion);

  var CF = Promise.promisifyAll(new AWS.CloudFormation({
    apiVersion: '2010-05-15',
  }));

  return CF.getTemplateAsync({
        StackName: _this.cfGetLambdasStackName(stage, projName)
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
    Promise.reject(new JawsError('Type ' + type + ' invalid. Must be lambdas or resources', JawsError.errorCodes.UNKNOWN));
  }

  var d = new Date(),
      cfPath = path.join(projRootPath, 'cloudformation', projStage, awsRegion, type + '-cf.json'),
      key = ['JAWS', projName, projStage, 'cloudformation/' + type].join('/') + '@' + d.getTime() + '.json',
      params = {
        Bucket: bucketName,
        Key: key,
        ACL: 'private',
        ContentType: 'application/json',
        Body: fs.readFileSync(cfPath),
      };

  return this.putS3Object(awsProfile, awsRegion, params)
      .then(function() {
        //Really AWS - TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
        var s3 = new AWS.S3();

        //Seriously, not cool...
        return 'https://' + s3.endpoint.hostname + '/' + bucketName + '/' + key;
      })
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
  var _this = this,
      awsProfile = JAWS._meta.profile,
      projRootPath = JAWS._meta.projectRootPath,
      bucketName = JAWS._meta.projectJson.jawsBuckets[region],
      projName = JAWS._meta.projectJson.name;

  _this.configAWS(awsProfile, region);

  var CF = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetLambdasStackName(stage, projName);

  var params = {
    StackName: stackName,
    Capabilities: [],
    OnFailure: 'ROLLBACK',
    Parameters: [{
      ParameterKey: 'aaLambdaRoleArn',
      ParameterValue: lambdaRoleArn,
      UsePreviousValue: false,
    },],
    Tags: [{
      Key: 'STAGE',
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
  var _this = this,
      awsProfile = JAWS._meta.profile,
      projRootPath = JAWS._meta.projectRootPath,
      bucketName = JAWS._meta.projectJson.jawsBuckets[region],
      projName = JAWS._meta.projectJson.name;

  _this.configAWS(awsProfile, region);

  var CF = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetLambdasStackName(stage, projName);

  var params = {
    StackName: stackName,
    Capabilities: [],
    UsePreviousTemplate: false,
    Parameters: [{
      ParameterKey: 'aaLambdaRoleArn',
      ParameterValue: lambdaRoleArn,
      UsePreviousValue: false,
    },]
  };

  return _this.putCfFile(awsProfile, projRootPath, region, bucketName, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CF.updateStackAsync(params);
      });
};

/**
 * CloudFormation: Create Resources Stack
 * @param awsProfile
 * @param awsRegion
 * @param projRootPath
 * @param projName
 * @param projStage
 * @param projNotificationEmail
 * @returns {Promise}
 */

exports.cfCreateResourcesStack = function(awsProfile, awsRegion, projRootPath, projName, projStage, projDomain, projNotificationEmail) {

  var _this = this;

  _this.configAWS(awsProfile, awsRegion);

  var CF = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      }));

  var stackName = _this.cfGetResourcesStackName(projStage, projName);
  var jawsBucket = utils.generateJawsBucketName(projStage, awsRegion, projDomain);
  var resourcesTemplate = require('../templates/resources-cf.json');

  var params = {
    StackName: stackName,
    Capabilities: [
      'CAPABILITY_IAM',
    ],
    TemplateBody: JSON.stringify(resourcesTemplate),
    OnFailure: 'ROLLBACK',
    Parameters: [{
      ParameterKey: 'aaProjectName',
      ParameterValue: projName,
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaStage',
      ParameterValue: projStage,
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaJawsBucket',
      ParameterValue: jawsBucket,
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaDataModelPrefix',
      ParameterValue: projStage,
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaProjectDomain',
      ParameterValue: 'mydomain.com',
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaNotficationEmail',
      ParameterValue: projNotificationEmail,
      UsePreviousValue: false,
    }, {
      ParameterKey: 'aaDefaultDynamoRWThroughput',
      ParameterValue: '1',
      UsePreviousValue: false,
    },],
    Tags: [{
      Key: 'STAGE',
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
 * @returns {*}
 */

exports.cfUpdateResourcesStack = function(JAWS, stage, region) {

  var _this = this,
      awsProfile = JAWS._meta.profile,
      projRootPath = JAWS._meta.projectRootPath,
      bucketName = JAWS._meta.projectJson.jawsBuckets[region],
      projName = JAWS._meta.projectJson.name;

  _this.configAWS(awsProfile, region);

  var CF = Promise.promisifyAll(new AWS.CloudFormation({
        apiVersion: '2010-05-15',
      })),
      stackName = _this.cfGetResourcesStackName(stage, projName);

  var params = {
    StackName: stackName,
    Capabilities: [
      'CAPABILITY_IAM',
    ],
    UsePreviousTemplate: false,
    Parameters: []
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
 * @returns {Promise}
 */

exports.monitorCf = function(cfData, awsProfile, region, createOrUpdate, checkFreq) {
  var _this = this,
      stackStatusComplete,
      validStatuses;

  if (!checkFreq) checkFreq = 5000;

  if (createOrUpdate == 'create') {
    stackStatusComplete = 'CREATE_COMPLETE';
    validStatuses = ['CREATE_IN_PROGRESS', stackStatusComplete];
  } else if (createOrUpdate == 'update') {
    stackStatusComplete = 'UPDATE_COMPLETE';
    validStatuses = ['UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', stackStatusComplete];
  } else {
    Promise.reject(new JawsError('Must specify create or update', JawsError.errorCodes.UNKNOWN));
  }

  return new Promise(function(resolve, reject) {

    var stackStatus = null,
        stackData = null;

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

                  if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                    console.log((data.Stacks && data.Stacks.length ? data.Stacks[0] : data));
                    return reject(new JawsError(
                        'Something went wrong while ' + createOrUpdate + 'ing your cloudformation'));
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
 * @returns {*}
 */

exports.createBucket = function(awsProfile, awsRegion, bucketName) {
  this.configAWS(awsProfile, awsRegion);

  var s3 = Promise.promisifyAll(new AWS.S3());

  return s3.getBucketAclAsync({Bucket: bucketName})
      .then(function() {
      })
      .error(function(err) {
        if (err.code == 'AccessDenied') {
          throw new JawsError(
              'Bucket ' + bucketName + ' already exists and you do not have permissions to use it',
              JawsError.errorCodes.ACCESS_DENIED
          );
        }

        return s3.createBucketAsync({
          Bucket: bucketName,
          ACL: 'private',
        });
      });
};

/**
 * S3: Put Object
 * @param awsProfile
 * @param awsRegion
 * @param params
 * @returns {*}
 */

exports.putS3Object = function(awsProfile, awsRegion, params) {
  this.configAWS(awsProfile, awsRegion);
  var s3 = Promise.promisifyAll(new AWS.S3());
  return s3.putObjectAsync(params);
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
  var s3 = Promise.promisifyAll(new AWS.S3());
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
  var key = ['JAWS', projectName, stage, 'envVars', '.env'].join('/'),
      params = {
        Bucket: bucketName,
        Key: key,
      };

  utils.jawsDebug('env var s3 key: ' + key);
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
  var params = {
    Bucket: bucketName,
    Key: ['JAWS', projectName, stage, 'envVars', '.env'].join('/'),
    ACL: 'private',
    ContentType: 'text/plain',
    Body: contents,
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
 * @returns {Promise} key of zip file in s3
 */

exports.putLambdaZip = function(awsProfile, awsRegion, bucketName, projectName, stage, lambdaName, zipBuffer) {
  var d = new Date(),
      key = ['JAWS', projectName, stage, 'lambdas', lambdaName + '@' + d.getTime() + '.zip'].join('/'),
      params = {
        Bucket: bucketName,
        Key: key,
        ACL: 'private',
        ContentType: 'application/zip',
        Body: zipBuffer,
      };

  utils.jawsDebug('lambda zip s3 key: ' + key);

  return this.putS3Object(awsProfile, awsRegion, params)
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
    var cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
    });

    var params = {
      logGroupName: logGroupName,
      descending: true,
      limit: limit || 5,
      orderBy: 'LastEventTime',
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
    var cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
    });

    var params = {
      logGroupName: logGroupName,
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

  var lambda = new AWS.Lambda();

  var params = {};

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

  var lambda = new AWS.Lambda();

  var params = {
    FunctionName: functionName.trim()
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

  var lambda = new AWS.Lambda();

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

  var lambda = new AWS.Lambda();

  var params = {
    FunctionName: functionName, /* required */
    StatementId: statementId, /* required */
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
