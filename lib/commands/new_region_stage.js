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
    return Promise.reject(new JawsError('Stage ' + stageName + ' is invalid (not defined in jaws.json:project.stages)'));
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

  return Promise.resolve();
}

function _updateJawsProjJson(JAWS, regionName, stageName, lambdaArn, apiArn) {
  var stages = JAWS._meta.projectJson.project.stages,
      projJawsJsonPath = path.join(JAWS._meta.projectRootPath, 'jaws.json'),
      regionObj = {
        region: regionName,
        iamRoleArnLambda: lambdaArn || "",
        iamRoleArnApiGateway: apiArn || "",
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
      '" stage of your JAWS project in the new ' + region + ' region.  This takes around 5 minutes to set-up. Sit tight!';
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
      ''
  )
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, JAWS._meta.profile, region);
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
    deferred = _validateNewStage(JAWS, stageName);
  }

  //TODO: if is create stage, upload skeleton env var file to s3...

  return deferred
      .then(function() {
        if (noExeCf) {
          utils.logIfVerbose('No exec cf specified, updating proj jaws.json only');
          return _updateJawsProjJson(JAWS, regionName, stageName);
        } else {
          return _createCfStack(JAWS)
              .then(function(cfOutputs) {
                return _updateProjectJsonArns(cfOutputs, JAWS, regionName, stageName)
              });
        }
      });
};
