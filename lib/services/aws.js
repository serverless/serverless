'use strict';

/**
 * JAWS Services: AWS
 */

var Promise = require('bluebird'),
  AWS = require('aws-sdk'),
  path = require('path'),
  os = require('os'),
  JawsError = require('../jaws-error'),
  fs = require('fs');

Promise.promisifyAll(fs);


/**
 * AWS Config
 */

var awsConfig = module.exports.configAWS = function(awsProfile, awsRegion) {

  // Check Profile Exists
  profilesGet(awsProfile);

  // Set Credentials
  AWS.config.credentials = new AWS.SharedIniFileCredentials({
    profile: awsProfile
  });

  // Set Region
  AWS.config.update({
    region: awsRegion
  });
}


/**
 * Profiles: Get Path
 */

var profilesGetPath = module.exports.profilesGetPath = function() {

  var env = process.env;
  var home = env.HOME ||
    env.USERPROFILE ||
    (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

  if (!home) {
    throw new JawsError('Cant find homedir', JawsError.errorCodes.MISSING_HOMEDIR);
  }

  return path.join(home, '.aws');
}


/**
 * Profiles: List
 */

var profilesList = module.exports.profilesList = function() {
  var credsPath = path.join(profilesGetPath(), 'credentials');
  return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
}


/**
 * Profiles: Set
 */

var profilesSet = module.exports.profilesSet = function(awsProfile, awsRegion, accessKeyId, secretKey) {

  var credsPath = path.join(profilesGetPath(), 'credentials');
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
}


/**
 * Profiles: Get
 */

var profilesGet = module.exports.profilesGet = function(awsProfile) {
  var profiles = profilesList();

  if (!profiles[awsProfile]) {
    throw new JawsError('Cant find profile in ~/.aws/config', awsProfile);
  }
}


/**
 * IAM: Get Role
 */

var iamGetRole = exports.iamGetRole = function(awsProfile, awsRegion, roleName) {
  return new Promise(function(resolve, reject) {

    // Config AWS
    awsConfig(awsProfile, awsRegion);

    // Instantiate
    var IAM = new AWS.IAM({
      apiVersion: '2010-05-08'
    });

    var params = {
      RoleName: roleName
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
}


/**
 * CloudFormation: Create Stack
 */

var cfCreateStack = exports.cfCreateStack = function(awsProfile, awsRegion, projectRootPath, projectName, projectStage, projectNotificationEmail) {
  return new Promise(function(resolve, reject) {

    // Config AWS
    awsConfig(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15'
    });

    var params = {
      StackName: projectStage + '-' + projectName, // stack names are alphanumeric + -, no _ :(
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      OnFailure: 'ROLLBACK',
      Parameters: [{
        ParameterKey: 'aaProjectName',
        ParameterValue: projectName,
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaStage',
        ParameterValue: projectStage,
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaDataModelPrefix',
        ParameterValue: projectStage,
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaHostedZoneName',
        ParameterValue: 'mydomain.com', //TODO: should we prompt for this?
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaNotficationEmail',
        ParameterValue: projectNotificationEmail,
        UsePreviousValue: false,
      }, {
        ParameterKey: 'aaDefaultDynamoRWThroughput',
        ParameterValue: '1',
        UsePreviousValue: false,
      }, ],
      Tags: [{
        Key: 'STAGE',
        Value: projectStage,
      }, ],

      // Gotta be careful, TemplateBody has a limit of 51,200 bytes. If we hit limit use TemplateURL
      TemplateBody: JSON.stringify(require(path.join(projectRootPath, 'jaws-cf.json'))),

    };

    CF.createStack(params, function(error, data) {

      if (error) {
        return reject(new JawsError(
          error.message,
          JawsError.errorCodes.UNKNOWN));
      } else {
        return resolve(data);
      }

    });
  });
}



/**
 * CloudFormation: Describe Stack
 */

var cfDescribeStacks = exports.cfDescribeStacks = function(awsProfile, awsRegion, stackName) {
  return new Promise(function(resolve, reject) {

    // Config AWS
    awsConfig(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15'
    });

    var params = {
      StackName: stackName
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
}


/**
 * CloudFormation: Describe Stack Resource
 */

var cfDescribeStackResource = exports.cfDescribeStackResource = function(awsProfile, awsRegion, stackId, cfResourceId) {
  return new Promise(function(resolve, reject) {

    // Config AWS
    awsConfig(awsProfile, awsRegion);

    // Instantiate
    var CF = new AWS.CloudFormation({
      apiVersion: '2010-05-15'
    });

    var params = {
      LogicalResourceId: cfResourceId,
      StackName: stackId
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
}


/**
 * CloudWatchLogs: Get Log Streams
 */

var cwGetLogStreams = exports.cwGetLogStreams = function(logGroupName, limit) {
  return new Promise(function(resolve, reject) {

    // Instantiate
    var cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28'
    });

    var params = {
      logGroupName: logGroupName,
      descending: true,
      limit: limit || 5,
      orderBy: 'LastEventTime'
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
}


/**
 * CloudWatchLogs: Get Log Stream Events
 */

var cwGetStreamEvents = exports.cwGetStreamEvents = function(logGroupName, logStreamName) {
  return new Promise(function(resolve, reject) {

    // Instantiate
    var cwLogs = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28'
    });

    var params = {
      logGroupName: logGroupName,
      logStreamName: logStreamName
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
  })
}
