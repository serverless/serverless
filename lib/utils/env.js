'use strict';

/**
 * Environment variable utilities
 */
const path      = require('path'),
      JawsUtils = require('./index'),
      JawsCLI   = require('./cli'),
      JawsError = require('../jaws-error'),
      AWSUtils  = require('./aws'),
      dotenv    = require('dotenv'),
      Promise   = require('bluebird');

/**
 *
 * @param Jaws
 * @param region
 * @param stage
 * @returns {Promise.<Map>} {raw: "",map:{}}
 */
exports.getEnvFileAsMap = function(Jaws, region, stage) {
  let deferred;

  if (stage == 'local') {
    deferred = Promise.resolve(fs.readFileSync(path.join(Jaws._projectRootPath, '.env')));
  } else {
    deferred = Jaws.getEnvFile(region, stage)
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

/**
 * Get env files for a region or all regions, for a given stage
 *
 * @param Jaws
 * @param region string 'all' or region name
 * @param stage
 * @returns {Promise.<Array>}  {regionName: "", vars: {}, raw: ""}
 */
exports.getEnvFiles = function(Jaws, region, stage) {
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
    if (!Jaws._projectJson.stage[stage]) {
      return Promise.reject(new JawsError(`Invalid stage ${stage}`, JawsError.errorCodes.UNKNOWN));
    }

    Jaws._projectJson.stage[stage].forEach(regionCfg => {
      regionGets.push(
        _this.getEnvFileAsMap(Jaws, regionCfg.region, stage)
          .then(envVars => {
            return {regionName: regionCfg.region, vars: envVars.map, raw: envVars.raw};
          }));
    });
  }

  return Promise.all(regionGets);
};

/**
 * Put env file contents to region + stage file
 *
 * @param Jaws
 * @param region
 * @param stage
 * @param contents
 * @returns {Promise}
 */
exports.putEnvFile = function(Jaws, region, stage, contents) {

  let bucket = Jaws.getProjectBucket(region, stage);

/*
  let bucket = Jaws.getJawsBucket(region, stage);
  let config = {
    profile: Jaws._awsProfile,
    region: region
  };
  let S3 = require('./aws/S3')(config);
*/
  JawsCLI.log(
    `Uploading ENV file from S3 bucket: ${bucket} in ${region}`
  );

  return S3.sPutEnvFile(
    bucket,
    Jaws._projectJson.name,
    stage,
    contents);
};
