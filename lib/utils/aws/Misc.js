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
 * Add the credentials from the given profile to the given config object
 * @param config The configuration object to add the credentials to
 * @param awsProfile The AWS credentials profile to obtain the credentials from (that will be added to the given config)
 */
module.exports.addProfileCredentials = function(config, awsProfile) {
  let profiles = this.profilesMap(),
      profile = profiles[awsProfile],
      ret = !(!profile);

  if(ret) {
    config.awsAdminKeyId          = profile.aws_access_key_id;
    config.awsAdminSecretKey      = profile.aws_secret_access_key;
    if (profile.aws_session_token) {                                  // for nodejs' aws-sdk (+ more?)
      config.awsAdminSessionToken = profile.aws_session_token;
    } else if (profile.aws_security_token) {                          // for python' boto (+ more?)
      config.awsAdminSessionToken = profile.aws_security_token;
    }
  }

  return ret;
};

// separate credential environment variable prefix from obtaining the credentials from the environment
let _addEnvironmentCredentials = function(config, prefix) {
  let envCreds = new AWS.EnvironmentCredentials(prefix);
  // Set Admin API Keys
  config.awsAdminKeyId          = envCreds.accessKeyId      || config.awsAdminKeyId;
  config.awsAdminSecretKey      = envCreds.secretAccessKey  || config.awsAdminSecretKey;
  if(envCreds.sessionToken) {
    config.awsAdminSessionToken = envCreds.sessionToken;
  }
};

/**
 * Add credentials from the environment
 * @param config The configuration object to add the credentials to
 */
module.exports.addEnvironmentCredentials = function(config) {
  _addEnvironmentCredentials(config, 'AWS');                  // allow for Amazon standard credential environment variable prefix 
  _addEnvironmentCredentials(config, 'SERVERLESS_ADMIN_AWS'); // but override with more specific credentials if these are also provided.
};

/**
 * Create the default config for the AWS SDK service objects
 * @param config The configuration to base the AWS SDK config off of
 * @returns {{region: *, accessKeyId: *, secretAccessKey: *}}
 */
module.exports.createAwsConfig = function(config) {
  let ret = {
    region: config.region,
    accessKeyId: config.awsAdminKeyId,
    secretAccessKey: config.awsAdminSecretKey
  };
  if (config.awsAdminSessionToken) {
    ret.sessionToken = config.awsAdminSessionToken;
  }
  return ret;
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
    if (!serverless.state.meta.get().stages[stage]) {
      return Promise.reject(new SError(`Invalid stage ${stage}`, SError.errorCodes.UNKNOWN));
    }
    Object.keys(serverless.state.meta.get().stages[stage].regions).forEach(region => {
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
    deferred = Promise.resolve(fs.readFileSync(Serverless.project.getFilePath( '.env' )));
  } else {
    let projectName  = Serverless.state.meta.get().variables.project,
        bucketName   = Serverless.state.meta.get().variables.projectBucket,
        bucketRegion = bucketName.split('.')[1];

    let awsConfig = this.createAwsConfig(Serverless.config);
    awsConfig.region = bucketRegion;

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
