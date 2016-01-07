'use strict';

/**
 * Serverless Services: AWS: Misc
 * - Prefix custom methods with "s"
 */

let path      = require('path'),
    os        = require('os'),
    AWS       = require('aws-sdk'),
    SError    = require('../../ServerlessError'),
    SUtils    = require('../../utils'),
    SCli      = require('../../utils/cli'),
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
- * Get the directory containing AWS configuration files
- */

module.exports.getConfigDir = function() {

  let env  = process.env;
  let home = env.HOME ||
      env.USERPROFILE ||
      (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

  if (!home) {
    throw new SError('Cant find homedir', SError.errorCodes.MISSING_HOMEDIR);
  }

  return path.join(home, '.aws');
};

/**
 * Gets a map of AWS profiles from ~/.aws/credentials
 */

module.exports.profilesMap = function() {
  let credsPath = path.join(this.getConfigDir(), 'credentials');

  try {
    return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
  }
  catch (e) {
    return [];
  }

};

/**
 * Get AWS profiles from the filesystem
 */

module.exports.profilesGet = function(awsProfile) {

  let profiles = this.profilesMap();

  if (!profiles[awsProfile]) {
    throw new SError(`Cant find profile ${awsProfile} in ~/.aws/credentials`, awsProfile);
  }

  return profiles;
};


/**
 * Get ENV Files
 * - Get env files for a region or all regions, for a given stage
 * - Region param can be "all"
 */

module.exports.getEnvFiles = function(serverless, region, stage) {

  let _this      = this,
      regionGets = [];

  if (region != 'all' || stage == 'local') {  //single region
    if (stage == 'local') {
      region = 'local';
    }

    regionGets.push(_this.getEnvFileAsMap(serverless, region, stage)
        .then(envVars => {
          return {region: region, vars: envVars.map, raw: envVars.raw};
        }));

  } else {
    // All regions
    let Meta = new serverless.classes.Meta(serverless);
    if (!Meta.data.private.stages[stage]) {
      return Promise.reject(new SError(`Invalid stage ${stage}`, SError.errorCodes.UNKNOWN));
    }
    Object.keys(Meta.data.private.stages[stage].regions).forEach(region => {
      regionGets.push(
          _this.getEnvFileAsMap(serverless, region, stage)
              .then(envVars => {
                return {region: region, vars: envVars.map, raw: envVars.raw};
              }));
    });
  }

  return Promise.all(regionGets);
};

/**
 * Get Env File As Map
 */

module.exports.getEnvFileAsMap = function(Serverless, region, stage) {

  let deferred;

  if (stage == 'local') {
    deferred = Promise.resolve(fs.readFileSync(path.join(Serverless.config.projectPath, '.env')));
  } else {
    let Meta         = new Serverless.classes.Meta(Serverless),
        projectName  = Meta.data.private.variables.project,
        bucketName   = Meta.data.private.variables.projectBucket,
        bucketRegion = bucketName.split('.')[1];

    let awsConfig = {
      region:          bucketRegion,
      accessKeyId:     Serverless.config.awsAdminKeyId,
      secretAccessKey: Serverless.config.awsAdminSecretKey
    };

    let S3 = require('./S3')(awsConfig);

    SCli.log(`Getting ENV file from S3 bucket: ${bucketName}`);

    deferred = S3.sGetEnvFile(bucketName, projectName, stage, region)
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
