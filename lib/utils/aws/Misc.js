'use strict';

/**
 * JAWS Services: AWS: Lambda
 * - Prefix custom methods with "s"
 */

let path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    async     = require('async'),
    fs        = require('fs');


module.exports.validLambdaRegions = [
  'us-east-1',
  'us-west-2',      // Oregon
  'eu-west-1',      // Ireland
  'ap-northeast-1', // Tokyo
];

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
