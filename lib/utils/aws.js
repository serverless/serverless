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

  var credsPath = path.join(this.getConfigDir(), 'credentials');
  fs.appendFileSync(
      credsPath,
      '[' + awsProfile + ']' + os.EOL +
      'aws_access_key_id = ' + accessKeyId.trim() + os.EOL +
      'aws_secret_access_key = ' + secretKey.trim() + os.EOL);

  var profileNameForConfig = (awsProfile == 'default') ? 'default' : 'profile ' + awsProfile;

  fs.appendFileSync(
      path.join(path.dirname(credsPath), 'config'),
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
 * CloudFormation: Create Stack
 *
 * @param awsProfile
 * @param awsRegion
 * @param projRootPath
 * @param projName
 * @param projStage
 * @param projNotificationEmail
 * @returns {Promise}
 */

exports.cfCreateResourcesStack = function(awsProfile, awsRegion, projRootPath, projName, projStage, projNotificationEmail) {
  var _this = this;

  return new Promise(function(resolve, reject) {

    // Config AWS
    _this.configAWS(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15',
    });

    var params = {
      StackName: projStage + '-' + projName, // stack names are alphanumeric + -, no _ :(
      Capabilities: [
        'CAPABILITY_IAM',
      ],
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
        ParameterKey: 'aaDataModelPrefix',
        ParameterValue: projStage,
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaHostedZoneName',
        ParameterValue: 'mydomain.com', //TODO: should we prompt for this?
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

      // Gotta be careful, TemplateBody has a limit of 51,200 bytes. If we hit limit use TemplateURL
      TemplateBody: JSON.stringify(require(path.join(projRootPath, 'jaws-cf.json'))),
    };

    CF.createStack(params, function(error, data) {

      if (error) {
        console.error(error);
        return reject(new JawsError(error.message, JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }
    });
  });
};

/**
 * CloudFormation: Monitor CF Create
 * @param cfData
 * @param awsProfile
 * @param region
 * @returns {bluebird|exports|module.exports}
 */

exports.monitorCfCreate = function(cfData, awsProfile, region) {
  var _this = this;

  return new Promise(function(resolve, reject) {

    var stackStatus = null,
        stackData = null;

    async.whilst(
        function() {
          return stackStatus !== 'CREATE_COMPLETE';
        },

        function(callback) {

          // Call AWS every 5 minutes until CF Stack has been created
          setTimeout(function() {

            _this.cfDescribeStacks(awsProfile, region, cfData.StackId)
                .then(function(data) {
                  stackData = data;
                  stackStatus = stackData.Stacks[0].StackStatus;

                  if (!stackStatus || ['CREATE_IN_PROGRESS', 'CREATE_COMPLETE'].indexOf(stackStatus) === -1) {
                    return reject(new JawsError(
                        'Something went wrong while creating your JAWS resources',
                        JawsError.errorCodes.UNKNOWN));
                  } else {
                    return callback();
                  }
                });
          }, 5000);
        },

        function() {
          //console.log('CloudFormation Stack ' + stackData.Stacks[0].StackName + ' successfully created.');
          return resolve(stackData.Stacks[0]);
        }
    );
  });
};


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

exports.putS3Object = function(awsProfile, awsRegion, params) {
  this.configAWS(awsProfile, awsRegion);
  var s3 = Promise.promisifyAll(new AWS.S3());
  return s3.putObjectAsync(params);
};

/**
 * Get object from s3
 *
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
 * Get the env file for a given stage
 *
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

  return this.getS3Object(awsProfile, awsRegion, params);
};

/**
 * Put up the env file for a given stage
 *
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
 * Put up deployment zip for a given stage
 *
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

  return this.putS3Object(awsProfile, awsRegion, params)
      .then(function() {
        return key;
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
 *
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
 * CloudWatchLogs: Get Log Streams
 *
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
 *
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
