'use strict';

/**
 * JAWS Command: tag
 * - Tags a lambda function with "deploy:true"
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    fs = require('fs'),
    AWSUtils = require('../utils/aws'),
    path = require('path'),
    chalk = require('chalk'),
    dotenv = require('dotenv');

module.exports = function(JAWS) {
  JAWS.getEnvFileAsMap = function(awsProfile, awsRegion, bucketName, projectName, stage) {
    var _this = this,
        deferred;

    if (stage == 'local') {
      deferred = Promise.resolve(fs.readFileSync(path.join(_this._meta.projectRootPath, 'back', '.env')));
    } else {
      deferred = AWSUtils.getEnvFile(
          awsProfile,
          awsRegion,
          bucketName,
          projectName,
          stage
      )
          .then(function(s3ObjData) {
            if (!s3ObjData.Body) {
              return '';
            }

            return s3ObjData.Body;
          });
    }

    return deferred
        .then(function(envFileBuffer) {
          return dotenv.parse(envFileBuffer);
        })
        .catch(function(err) {
          return {};
        });
  };

  /**
   * List all env vars. Display what env is for stage and where all env vars are used.
   * Also indicates which module envVars are not set in stage
   *
   * @param stage
   * @returns {Promise} map of env vars
   */
  JAWS.listEnv = function(stage) {
    var _this = this,
        projectName = this._meta.projectJson.name,
        projectBucketRegion = this._meta.projectJson.project.envVarBucket.region,
        projectBucketName = this._meta.projectJson.project.envVarBucket.name,
        awsProfile = this._meta.profile;

    return Promise.all([
      utils.findAllJawsJsons(path.join(utils.findProjectRootPath(process.cwd()), 'back')),
      _this.getEnvFileAsMap(
          awsProfile,
          projectBucketRegion,
          projectBucketName,
          projectName,
          stage
      ),])
        .spread(function(jawsJsonPaths, envMap) {
          var envInBackMap = {};

          //first build up a list of all env vars modules say they need
          jawsJsonPaths.forEach(function(jjp) {
            var jawsJson = require(jjp);
            if (jawsJson.envVars) {
              jawsJson.envVars.forEach(function(key) {
                if (envInBackMap[key]) {
                  envInBackMap[key].push(jawsJson.name);
                } else {
                  envInBackMap[key] = [jawsJson.name];
                }
              });
            }
          });

          console.log('ENV live in', stage, ':');
          console.log(JSON.stringify(envMap, null, 2));

          var localEnvKeys = Object.keys(envInBackMap);
          if (localEnvKeys.length) {
            console.log('\nWhere vars are used (' + chalk.yellow('yellow') + ' indicates not set in ' + stage + '):');
            localEnvKeys.forEach(function(key) {
              var keyColored = (envMap[key]) ? key : chalk.yellow(key);

              console.log(keyColored + ':', envInBackMap[key]);
            });
          }

          console.log('\n');

          return envMap;
        });
  };

  /**
   * Get value of key at stage
   *
   * @param stage
   * @param key
   * @returns {Promise} string value
   */
  JAWS.getEnvKey = function(stage, key) {
    var _this = this,
        projectName = this._meta.projectJson.name,
        projectBucketRegion = this._meta.projectJson.project.envVarBucket.region,
        projectBucketName = this._meta.projectJson.project.envVarBucket.name,
        awsProfile = _this._meta.profile;

    return _this.getEnvFileAsMap(
        awsProfile,
        projectBucketRegion,
        projectBucketName,
        projectName,
        stage
    )
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
   * @param stage
   * @param key
   * @param val if omitted will unset
   * @returns {Promise} string value
   */
  JAWS.setEnvKey = function(stage, key, val) {
    var _this = this,
        projectName = this._meta.projectJson.name,
        projectBucketRegion = this._meta.projectJson.project.envVarBucket.region,
        projectBucketName = this._meta.projectJson.project.envVarBucket.name,
        awsProfile = _this._meta.profile;

    return _this.getEnvFileAsMap(
        awsProfile,
        projectBucketRegion,
        projectBucketName,
        projectName,
        stage
    )
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
            return utils.writeFile(path.join(_this._meta.projectRootPath, 'back', '.env'), contents);
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
};
