'use strict';

/**
 * JAWS Command: env
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    fs = require('fs'),
    JawsCLI = require('../utils/cli'),
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
          deferred = Promise.resolve(fs.readFileSync(path.join(JAWS._meta.projectRootPath, '.env')));
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
        console.log(err)
        return {};
      });
};

module.exports._getEnvFiles = function(JAWS, stage, region) {
  var _this = this,
      regionGets = [];

  if (region != 'all' || stage == 'local') {
    if (stage == 'local') {
      region = 'local';
    }
    regionGets.push(_this.getEnvFileAsMap(JAWS, stage, region).then(function(envVars) {
      return {regionName: region, vars: envVars.map, raw: envVars.raw};
    }));
  } else {
    JAWS._meta.projectJson.stages[stage].forEach(function(regionCfg) {
      regionGets.push(
          _this.getEnvFileAsMap(JAWS, stage, regionCfg.region)
              .then(function(envVars) {
                return {regionName: regionCfg.region, vars: envVars.map, raw: envVars.raw};
              }));
    });
  }

  return Promise.all(regionGets);
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
      projRootDir = JAWS._meta.projectRootPath;

  return utils.findAllAwsmJsons(path.join(projRootDir, 'aws_modules'))
      .then(function(awsmJsonPaths) {
        return [awsmJsonPaths, _this._getEnvFiles(JAWS, stage, region)];
      })
      .spread(function(awsmJsonPaths, envMapsByRegion) {
        var envInBackMap = {};
        JawsCLI.log('ENV vars for stage ' + stage + ':');
        envMapsByRegion.forEach(function(mapForRegion) {
          JawsCLI.log('------------------------------');
          JawsCLI.log(mapForRegion.regionName);
          JawsCLI.log('------------------------------');
          console.log(chalk.bold(mapForRegion.raw + ''));
          console.log('');
        });

        if (showWhereUsed) {
          //first build up a list of all env vars awsm modules say they need
          awsmJsonPaths.forEach(function(ajp) {
            var awsmJson = require(ajp);
            if (awsmJson.lambda && awsmJson.lambda.envVars) {
              awsmJson.lambda.envVars.forEach(function(key) {
                var rel = path.relative(path.join(projRootDir, 'aws_modules'), ajp);
                if (envInBackMap[key]) {
                  envInBackMap[key].push(rel);
                } else {
                  envInBackMap[key] = [rel];
                }
              });
            }
          });

          var awsmKeys = Object.keys(envInBackMap);
          if (awsmKeys.length) {
            JawsCLI.log('awsm.json:lambda.envVars and regions where they are used (red means NOT defined in region):');
            awsmKeys.forEach(function(key) {
              var regionNamesColored = envMapsByRegion.map(function(rMap) {
                return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
              });

              JawsCLI.log('------------------------------');
              JawsCLI.log(key);
              JawsCLI.log('------------------------------');

              JawsCLI.log(chalk.bold('aws mods using') + ': ' + envInBackMap[key].join(','));
              JawsCLI.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
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
 * @returns {Promise} map of val by region
 */
module.exports.getEnvKey = function(JAWS, stage, region, key) {
  var _this = this;

  return _this._getEnvFiles(JAWS, stage, region)
      .then(function(envMapsByRegion) {
        var valByRegion = {};

        JawsCLI.log('Values for ' + key + ' inn stage ' + stage + ' by region:');
        envMapsByRegion.forEach(function(mapForRegion) {
          var value = mapForRegion.vars[key] || chalk.red('NOT SET');
          console.log(chalk.underline.bold(mapForRegion.regionName) + ': ' + value);

          if (mapForRegion.vars[key]) {
            valByRegion[mapForRegion.regionName] = value;
          }
        });

        return valByRegion;
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
  var _this = this;

  return _this._getEnvFiles(JAWS, stage, region)
      .then(function(envMapsByRegion) {
        var putEnvQ = [];

        envMapsByRegion.forEach(function(mapForRegion) {
          if (val) {
            mapForRegion.vars[key] = val;
          } else {
            delete mapForRegion.vars[key];
          }

          var contents = '';
          Object.keys(mapForRegion.vars).forEach(function(newKey) {
            contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
          });

          if (stage == 'local') {
            putEnvQ.push(utils.writeFile(path.join(JAWS._meta.projectRootPath, '.env'), contents));
          } else {
            putEnvQ.push(JAWS.putEnvFile(mapForRegion.regionName, stage, contents));
          }
        });

        return Promise.all(putEnvQ);
      });
};
