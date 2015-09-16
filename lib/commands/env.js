'use strict';

/**
 * JAWS Command: env
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    fs = require('fs'),
    JawsCLI = require('../utils/cli'),
    AWSUtils = require('../utils/aws'),
    path = require('path'),
    chalk = require('chalk'),
    dotenv = require('dotenv');


/**
 *
 * @param JAWS
 * @param stage
 * @param region
 * @returns {Promise} {raw: "",map:{}}
 */
module.exports.getEnvFileAsMap = function(JAWS, stage, region) {
  return JAWS.validateProject()
      .then(function() {
        var deferred;

        if (stage == 'local') {
          deferred = Promise.resolve(fs.readFileSync(path.join(JAWS._meta.projectRootPath, 'back', '.env')));
        } else {
          deferred = JAWS.getEnvFile(region, stage)
              .then(function(s3ObjData) {
                if (!s3ObjData.Body) {
                  return '';
                }
                return s3ObjData.Body;
              });
        }
        return deferred;
      })
      .then(function(envFileBuffer) {
        return {raw: envFileBuffer, map: dotenv.parse(envFileBuffer)};
      })
      .catch(function(err) {
        return {};
      });
};

/**
 * List all env vars. Display what env is for stage and where all env vars are used.
 * Also indicates which module envVars are not set in stage
 *
 * @param {Jaws} JAWS
 * @param stage
 * @param region
 * @param showWhereUsed default false
 * @returns {Promise} map of env vars
 */
module.exports.listEnv = function(JAWS, stage, region, showWhereUsed) {
  var _this = this,
      backDir = path.join(JAWS._meta.projectRootPath, 'back');

  return utils.findAllAwsmJsons(backDir)
      .then(function(awsmJsonPaths) {
        var regionGets = [];

        if (region != 'all' || stage == 'local') {
          if (stage == 'local') {
            region = 'local';
          }
          regionGets.push(_this.getEnvFileAsMap(JAWS, stage, region).then(function(envVars) {
            return {regionName: region, vars: envVars.map, raw: envVars.raw};
          }));
        } else {
          utils.getProjRegionConfigForStage(JAWS._meta.projectJson, stage, region).forEach(function(regionCfg) {
            regionGets.push(
                _this.getEnvFileAsMap(JAWS, stage, regionCfg.region)
                    .then(function(envVars) {
                      return {regionName: regionCfg.region, vars: envVars.map, raw: envVars.raw};
                    }));
          });
        }

        return [awsmJsonPaths, Promise.all(regionGets)];
      })
      .spread(function(awsmJsonPaths, envMapsByRegion) {
        var envInBackMap = {};

        JawsCLI.log('ENV vars for stage ' + stage + ':');
        envMapsByRegion.forEach(function(mapForRegion) {
          JawsCLI.log('------------------------------');
          JawsCLI.log(mapForRegion.regionName);
          JawsCLI.log('------------------------------');

          console.log(mapForRegion.raw + '');
          console.log('\n');
        });

        if (showWhereUsed) {
          //first build up a list of all env vars awsm modules say they need
          awsmJsonPaths.forEach(function(ajp) {
            var awsmJson = require(ajp);
            if (awsmJson.lambda && awsmJson.lambda.envVars) {
              awsmJson.lambda.envVars.forEach(function(key) {
                var rel = path.relative(path.join(backDir, 'aws_modules'), ajp);
                if (envInBackMap[key]) {
                  envInBackMap[key].push(rel);
                } else {
                  envInBackMap[key] = [rel];
                }
              });
            }
          });


          var localEnvKeys = Object.keys(envInBackMap);
          if (localEnvKeys.length) {
            JawsCLI.log('Stages where awsm.json:lambda.envVars are used:');
            localEnvKeys.forEach(function(key) {
              var regionList = [];

              envMapsByRegion.forEach(function(rMap){

              });

              JawsCLI.log(key + ':');
            });
          }
        }

        return envMapsByRegion;
      });
};

/**
 * Get value of key at stage
 *
 * @param {Jaws} JAWS
 * @param stage
 * @param region
 * @param key
 * @returns {Promise} string value
 */
module.exports.getEnvKey = function(JAWS, stage, region, key) {
  var _this = this;

  return _this.getEnvFileAsMap(JAWS, stage)
      .then(function(envMap) {
        if (!envMap[key]) {
          throw new JawsError(key + ' not set in ' + stage, JawsError.errorCodes.ENV_KEY_NOT_SET);
        } else {
          console.log(envMap[key]);
          return envMap[key];
        }
      });
};

/**
 * Set or unset value of key at stage.
 * If key does not exist it will be created (if set)
 * If env does not exist, will be created
 *
 * @param {Jaws} JAWS
 * @param stage
 * @param region
 * @param key
 * @param val if omitted will unset
 * @returns {Promise} string value
 */
module.exports.setEnvKey = function(JAWS, stage, region, key, val) {
  var _this = this,
      projectName = JAWS._meta.projectJson.name,
      projectBucketRegion = JAWS._meta.projectJson.envVarBucket.region,
      projectBucketName = JAWS._meta.projectJson.envVarBucket.name,
      awsProfile = JAWS._meta.profile;

  return _this.getEnvFileAsMap(JAWS, stage)
      .then(function(envMap) {
        if (val) {
          envMap[key] = val;
        } else {
          delete envMap[key];
        }

        var contents = '';
        Object.keys(envMap).forEach(function(newKey) {
          contents += [newKey, envMap[newKey]].join('=') + '\n';
        });

        if (stage == 'local') {
          return utils.writeFile(path.join(JAWS._meta.projectRootPath, 'back', '.env'), contents);
        } else {
          return AWSUtils.putEnvFile(
              awsProfile,
              projectBucketRegion,
              projectBucketName,
              projectName,
              stage,
              contents);
        }
      });
};
