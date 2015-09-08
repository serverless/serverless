'use strict';

/**
 * Does one of the following:
 * -Creates a new region, primed with one stage
 * -Creates new stage in existing region
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    Spinner = require('cli-spinner').Spinner;

Promise.promisifyAll(fs);

function _validateNewRegion(JAWS, regionName, stageName) {
  if (!JAWS._meta.projectJson.project || !JAWS._meta.projectJson.project.stages) {
    return Promise.reject(new JawsError('Project has no existing stages object defined', JawsError.errorCodes.UNKNOWN));
  }

  //Make sure region is not already defined
  var stages = JAWS._meta.projectJson.project.stages;

  if (!stages[stageName]) {
    return Promise.reject(new JawsError(
        'Stage ' + stageName + ' is invalid (not defined in jaws.json:project.stages)',
        JawsError.errorCodes.UNKNOWN));
  }

  Object.keys(stages).forEach(function(stageName) {
    if (stages[stageName].region == regionName) {
      return Promise.reject(new JawsError('Region ' + regionName + ' already defined in stage ' + stageName));
    }
  });

  return Promise.resolve();
}

function _validateNewStage(JAWS, stageName) {
  if (!JAWS._meta.projectJson.project || !JAWS._meta.projectJson.project.stages) {
    return Promise.reject(new JawsError('Project has no existing stages object defined', JawsError.errorCodes.UNKNOWN));
  }

  //Make sure stage is not already defined
  var stages = JAWS._meta.projectJson.project.stages;

  if (stages[stageName]) {
    return Promise.reject(new JawsError('Stage ' + stageName + ' already exists in jaws.json:project.stages'));
  }

  //Make sure the stage is not already defined in s3 env var - dont want to overwrite it
  var envCmd = require('./env');
  return envCmd.getEnvFileAsMap(JAWS, stageName)
      .then(function(envMap) {
        if (Object.keys(envMap).length > 0) {
          throw new JawsError(
              'Stage ' + stageName + ' can not be created as an env var file already exists',
              JawsError.errorCodes.INVALID_RESOURCE_NAME
          );
        }
      });
}

function _updateJawsProjJson(JAWS, regionName, stageName, lambdaArn, apiArn) {
  var stages = JAWS._meta.projectJson.project.stages,
      projJawsJsonPath = path.join(JAWS._meta.projectRootPath, 'jaws.json'),
      regionObj = {
        region: regionName,
        iamRoleArnLambda: lambdaArn || '',
        iamRoleArnApiGateway: apiArn || '',
      };

  if (stages[stageName]) {
    stages[stageName].push(regionObj);
  } else {
    stages[stageName] = regionObj;
  }

  return utils.writeFile(projJawsJsonPath, JSON.stringify(JAWS._meta.projectJson, null, 2));
}

function _createCfStack(JAWS, region, stage) {
  var message = 'JAWS is now going to create an AWS CloudFormation Stack for the "' + stage +
      '" stage of your JAWS project in the new ' + region + ' region. This takes around 5 minutes. Sit tight!';
  var spinner = new Spinner('%s Creating CloudFormation Stack...');

  console.log(message);
  spinner.setSpinnerString('|/-\\');
  spinner.start();

  return AWSUtils.cfCreateStack(
      JAWS._meta.profile,
      region,
      JAWS._meta.projectRootPath,
      JAWS._meta.projectJson.name,
      stage,
      ''  //TODO: read email out of existing jaws-cf.json?
  )
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, JAWS._meta.profile, region, spinner);
      });
}

/**
 * Update Project JSON arns
 *
 * @param cfOutputs
 * @param {Jaws} JAWS
 * @param regionName
 * @param stageName
 * @returns {Promise}
 * @private
 */
function _updateProjectJsonArns(cfOutputs, JAWS, regionName, stageName) {

  var iamRoleArnLambda,
      iamRoleArnApiGateway;

  for (var i = 0; i < cfOutputs.length; i++) {
    if (cfOutputs[i].OutputKey === 'IamRoleArnLambda') {
      iamRoleArnLambda = cfOutputs[i].OutputValue;
    }

    if (cfOutputs[i].OutputKey === 'IamRoleArnApiGateway') {
      iamRoleArnApiGateway = cfOutputs[i].OutputValue;
    }
  }

  return _updateJawsProjJson(JAWS, regionName, stageName, iamRoleArnLambda, iamRoleArnApiGateway);
}

/**
 * Create env file skeletion for new stage
 *
 * @param {Jaws} JAWS
 * @param stageName
 * @private
 */
function _createEnvFile(JAWS, stageName) {
  var envFileContents = 'JAWS_STAGE=' + stageName + '\nJAWS_DATA_MODEL_PREFIX=' + stageName;
  return AWSUtils.putEnvFile(
      JAWS._meta.profile,
      JAWS._meta.projectJson.project.envVarBucket.region,
      JAWS._meta.projectJson.project.envVarBucket.name,
      JAWS._meta.projectJson.name,
      stageName,
      envFileContents);
}

/**
 *
 * @param {boolean} isCreateRegion if false means we are creating stage in existing region
 * @param {Jaws} JAWS
 * @param regionName
 * @param stageName the stage to prime in the new region
 * @param noExeCf don't execute CloudFormation at the end
 * @returns {*}
 */
module.exports.create = function(isCreateRegion, JAWS, regionName, stageName, noExeCf) {
  var deferred;
  if (isCreateRegion) {
    utils.logIfVerbose('Creating new region');
    deferred = _validateNewRegion(JAWS, regionName, stageName);
  } else {
    utils.logIfVerbose('Creating new stage');
    deferred = _validateNewStage(JAWS, stageName)
        .then(function() {
          return _createEnvFile(JAWS, stageName);
        }
    );
  }

  return deferred
      .then(function() {
        if (noExeCf) {
          utils.logIfVerbose('No exec cf specified, updating proj jaws.json only');

          console.log('Successfully created. CloudFormation file can be run manually');
          console.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');
          return _updateJawsProjJson(JAWS, regionName, stageName);
        } else {
          return _createCfStack(JAWS, regionName, stageName)
              .then(function(cfOutputs) {
                return _updateProjectJsonArns(cfOutputs, JAWS, regionName, stageName);
              });
        }
      });
};
