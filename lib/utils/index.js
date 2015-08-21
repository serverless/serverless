'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
    AWS = require('aws-sdk'),
    path = require('path'),
    os = require('os'),
    JawsError = require('../jaws-error'),
    fs = require('fs');

Promise.promisifyAll([
  fs,
]);

module.exports.findProjectRootPath = function(startDir) {

  // Defaults
  var previous = '/';

  // Check if startDir is root
  if (fs.existsSync(startDir + '/jaws.json')) {
    var jawsJsonInDir = require(startDir + '/jaws.json');
    if (jawsJsonInDir.profile === 'project') return startDir;
  }

  // Check up to 10 parent levels
  for (var i = 0; i < 10; i++) {

    previous = previous + '../';
    var fullPath = startDir + previous;

    if (fs.existsSync(fullPath + 'jaws.json')) {
      var jawsJson = require(fullPath + 'jaws.json');
      if (jawsJson.profile === 'project') return fullPath;
    }
  }

  return false;

};

/**
 * Get creds for profile as defined in ~/.aws/credentials
 *
 * @param profile
 * @returns {{accessKeyId:"",profile:"",secretAccessKey:""}}
 */
module.exports.getAwsAdminCreds = function(profile) {
  return new AWS.SharedIniFileCredentials({profile: profile || 'default'});
};

/**
 * Writes profile to ~/.aws/credentials if it does not exist
 *
 * @param profile
 */
module.exports.setAwsAdminCreds = function(profile, key, secret) {
  if (!profile) profile = 'default';

  try {
    var creds = this.getAwsAdminCreds(profile);
  } catch (e) {
    //This is good, we dont want profile to exist
  }

  if (creds && creds.accessKeyId) {
    throw new JawsError('AWS admin profile ' + profile + ' already exists', JawsError.errorCodes.UNKNOWN);
  }

  var credsPath = this.getAwsCredsPath();
  fs.appendFileSync(
      credsPath,
      '[' + profile + ']' + os.EOL +
      'aws_access_key_id = ' + key.trim() + os.EOL +
      'aws_secret_access_key = ' + secret.trim() + os.EOL);

  var profileNameForConfig = (profile == 'default') ? 'default' : 'profile ' + profile;

  fs.appendFileSync(
      path.join(path.dirname(credsPath), 'config'),
      '[' + profileNameForConfig + ']' + os.EOL +
      'region = us-east-1' + os.EOL);
};

module.exports.getAwsCredsPath = function() {
  var env = process.env;
  var home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

  if (!home) {
    throw new JawsError('Cant find homedir', JawsError.errorCodes.MISSING_HOMEDIR);
  }

  return path.join(home, '.aws', 'credentials');
};
