'use strict';

/**
 * JAWS Services: AWS: Misc
 * - Prefix custom methods with "s"
 */

let path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    JawsError = require('../../jaws-error'),
    JawsUtils = require('../../utils'),
    JawsCLI   = require('../../utils/cli'),
    async     = require('async'),
    dotenv    = require('dotenv'),
    fs        = require('fs');


module.exports.validLambdaRegions = [
  'us-east-1',
  'us-west-2',      // Oregon
  'eu-west-1',      // Ireland
  'ap-northeast-1', // Tokyo
];

/**
 * Get the directory containing AWS configuration files
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
 */

module.exports.profilesMap = function() {
  let credsPath = path.join(this.getConfigDir(), 'credentials');
  return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
};

/**
 * Set a new AWS profile on the filesystem.
 * - Creates entry in ~/.aws/config and credentials
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
 */

module.exports.profilesGet = function(awsProfile) {

  let profiles = this.profilesMap();

  if (!profiles[awsProfile]) {
    throw new JawsError(`Cant find profile ${awsProfile} in ~/.aws/credentials`, awsProfile);
  }
  return profiles;
};


/**
 * Get env files for a region or all regions, for a given stage
 *
 * @param Jaws
 * @param region string 'all' or region name
 * @param stage
 * @returns {Promise.<Array>}  {regionName: "", vars: {}, raw: ""}
 */
module.exports.getEnvFiles = function(Jaws, region, stage) {
  let _this      = this,
      regionGets = [];

  if (region != 'all' || stage == 'local') {  //single region
    if (stage == 'local') {
      region = 'local';
    }

    regionGets.push(_this.getEnvFileAsMap(Jaws, region, stage).then(envVars => {
      return {regionName: region, vars: envVars.map, raw: envVars.raw};
    }));
  } else {
    //All regions
    if (!Jaws._projectJson.stages[stage]) {
      return Promise.reject(new JawsError(`Invalid stage ${stage}`, JawsError.errorCodes.UNKNOWN));
    }

    Jaws._projectJson.stages[stage].forEach(regionCfg => {
      regionGets.push(
        _this.getEnvFileAsMap(Jaws, regionCfg.region, stage)
          .then(envVars => {
            return {regionName: regionCfg.region, vars: envVars.map, raw: envVars.raw};
          }));
    });
  }

  return Promise.all(regionGets);
};

module.exports.getEnvFileAsMap = function(Jaws, region, stage) {
  let deferred;

  if (stage == 'local') {
    deferred = Promise.resolve(fs.readFileSync(path.join(Jaws._projectRootPath, '.env')));
  } else {
    let bucket = JawsUtils.getProjRegionConfigForStage(Jaws._projectJson, stage, region).regionBucket;
    let config = {
      profile: Jaws._awsProfile,
      region: region
    };
    let S3 = require('./S3')(config);
    JawsCLI.log(`Getting ENV file from S3 bucket: ${bucket} in ${region}`);
    deferred = S3.sGetEnvFile(bucket, Jaws._projectJson.name, stage)
      .then(function(s3ObjData) {
        return (!s3ObjData.Body) ? '' : s3ObjData.Body;
      });
  }

  return deferred
    .then(function(envFileBuffer) {
      return {raw: envFileBuffer, map: dotenv.parse(envFileBuffer)};
    })
    .catch(function(err) {
      console.error(`Warning: trouble getting env for stage: ${stage} region: ${region}`, err);
      return {};
    });
};
