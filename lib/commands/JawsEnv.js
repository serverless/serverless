'use strict';

/**
 * JAWS Command: env
 */

let JawsError = require('../jaws-error'),
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

var CMD = class JawsEnv extends ProjectCmd {
  constructor(JAWS, stage, region) {
    super(JAWS);
    this._stage = stage;
    this._region = region;
  }

  getEnvFileAsMap() {
    let _this = this;

    return this._JAWS.validateProject()
        .then(function() {
          let deferred;

          if (_this._stage == 'local') {
            deferred = Promise.resolve(fs.readFileSync(path.join(_this._JAWS._meta.projectRootPath, '.env')));
          } else {
            deferred = _this._JAWS.getEnvFile(_this._region, _this._stage)
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
          console.log(err);
          return {};
        });
  }

  _getEnvFiles() {
    let _this = this,
        regionGets = [];

    if (_this._region != 'all' || _this._stage == 'local') {
      if (_this._stage == 'local') {
        _this._region = 'local';
      }
      regionGets.push(_this.getEnvFileAsMap(_this._JAWS, _this._stage, _this._region).then(envlets => {
        return {regionName: _this._region, lets: envlets.map, raw: envlets.raw};
      }));
    } else {
      JAWS._meta.projectJson.stages[stage].forEach(regionCfg => {
        regionGets.push(
            _this.getEnvFileAsMap(_this._JAWS, _this._stage, regionCfg.region)
                .then(envlets => {
                  return {regionName: regionCfg.region, lets: envlets.map, raw: envlets.raw};
                }));
      });
    }

    return Promise.all(regionGets);
  }

  /**
   * List all env lets. Display what env is for stage and where all env lets are used.
   * Also indicates which module envlets are not set in stage
   *
   * @param showWhereUsed default false
   * @returns {Promise} map of env lets
   */
  listEnv(showWhereUsed) {
    let _this = this,
        projRootDir = _this._JAWS._meta.projectRootPath,
        stage = _this._stage;

    return utils.findAllAwsmJsons(path.join(projRootDir, 'aws_modules'))
        .then(function(awsmJsonPaths) {
          return [awsmJsonPaths, _this._getEnvFiles(_this._JAWS, _this._stage, _this._region)];
        })
        .spread(function(awsmJsonPaths, envMapsByRegion) {
          let envInBackMap = {};
          JawsCLI.log(`ENV lets for stage ${stage}:`);
          envMapsByRegion.forEach(mapForRegion => {
            JawsCLI.log('------------------------------');
            JawsCLI.log(mapForRegion.regionName);
            JawsCLI.log('------------------------------');
            console.log(chalk.bold(mapForRegion.raw + ''));
            console.log('');
          });

          if (showWhereUsed) {
            //first build up a list of all env lets awsm modules say they need
            awsmJsonPaths.forEach(ajp => {
              let awsmJson = require(ajp);
              if (awsmJson.lambda && awsmJson.lambda.envlets) {
                awsmJson.lambda.envlets.forEach(function(key) {
                  let rel = path.relative(path.join(projRootDir, 'aws_modules'), ajp);
                  if (envInBackMap[key]) {
                    envInBackMap[key].push(rel);
                  } else {
                    envInBackMap[key] = [rel];
                  }
                });
              }
            });

            let awsmKeys = Object.keys(envInBackMap);
            if (awsmKeys.length) {
              JawsCLI.log('awsm.json:lambda.envlets and regions where they are used (red means NOT defined in region):');
              awsmKeys.forEach(key => {
                let regionNamesColored = envMapsByRegion.map(function(rMap) {
                  return (!rMap.lets[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
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
  }

  /**
   * Get value of key at stage
   *
   * @param key
   * @returns {Promise} map of val by region
   */
  getEnvKey(key) {
    let _this = this,
        stage = _this._stage;

    return this._getEnvFiles(_this._JAWS, stage, _this._region)
        .then(function(envMapsByRegion) {
          let valByRegion = {};

          JawsCLI.log(`Values for ${key} in stage ${stage} by region:`);
          envMapsByRegion.forEach(mapForRegion => {
            let value = mapForRegion.lets[key] || chalk.red('NOT SET');
            console.log(chalk.underline.bold(mapForRegion.regionName) + `: ${value}`);

            if (mapForRegion.lets[key]) {
              valByRegion[mapForRegion.regionName] = value;
            }
          });

          return valByRegion;
        });
  }


  /**
   * Set or unset value of key at stage.
   * If key does not exist it will be created (if set)
   * If env does not exist, will be created
   *
   * @param key
   * @param val if omitted will unset
   * @returns {Promise} string value
   */
  setEnvKey(key, val) {
    let _this = this;

    return _this._getEnvFiles(_this._JAWS, _this._stage, _this._region)
        .then(envMapsByRegion => {
          let putEnvQ = [];

          envMapsByRegion.forEach(mapForRegion => {
            if (val) {
              mapForRegion.lets[key] = val;
            } else {
              delete mapForRegion.lets[key];
            }

            let contents = '';
            Object.keys(mapForRegion.lets).forEach(newKey => {
              contents += [newKey, mapForRegion.lets[newKey]].join('=') + '\n';
            });

            if (stage == 'local') {
              putEnvQ.push(utils.writeFile(path.join(JAWS._meta.projectRootPath, '.env'), contents));
            } else {
              putEnvQ.push(JAWS.putEnvFile(mapForRegion.regionName, stage, contents));
            }
          });

          return Promise.all(putEnvQ);
        });
  }
};

/**************************************
 * EXPORTS
 **************************************/
module.exports = CMD;
