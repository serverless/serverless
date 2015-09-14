'use strict';

/**
 * JAWS Command: New Region/Stage
 * -Creates a new region, primed with one stage
 * -Creates new stage in existing region
 */

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    AWSUtils = require('../utils/aws'),
    utils = require('../utils'),
    Spinner = require('cli-spinner').Spinner;

Promise.promisifyAll(fs);

/**
 * Run
 */

module.exports.run = function(JAWS, type, stage, region, noCf) {
  var command = new CMD(JAWS, type, stage, region, noCf);
  return command.run();
};

/**
 * Command Class
 * @constructor
 */

function CMD(JAWS, type, stage, region, noCf) {
  this._JAWS = JAWS;
  this._type = type;
  this._stage = stage;
  this._region = region;
  this._noCf = noCf;
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  // Status
  if (_this._type === 'stage') JawsCli.log('Creating new stage "' + _this._stage + '"...');
  if (_this._type === 'region') JawsCli.log('Creating new region within stage "' + _this._stage + '"...');

  return Promise.try(function() {})
      .bind(_this)
      .then(_this._promptRegion)
      .then(_this._validate)
      .then(_this._createEnvFile)
      .then(_this._createCfStack)
      .then(_this._updateProjectJson);
});

/**
 * CMD: Prompt: Region
 */

CMD.prototype._promptRegion = Promise.method(function() {

  var _this = this;

  // If region exists, skip
  if (_this._region) return;

  var regions = [
      'us-east-1',
      'us-west-1',
      'eu-west-1',
      'ap-northeast-1',
  ];

  // Create Choices
  var choices = [];
  for (var i = 0; i < (regions.length + 1); i++) {
    choices.push({
      key: (i + 1) + ') ',
      value: regions[i],
      label: regions[i],
    });
  }

  return JawsCli.select('Choose a region within this stage: ', choices, false)
      .then(function(results) {
        _this._region = [results[0].value];
      });
});

/**
 * CMD: Validate
 */

CMD.prototype._validate = Promise.method(function() {

  var _this = this;

  // Check project config is valid
  if (!_this._JAWS._meta.projectJson.project || !_this._JAWS._meta.projectJson.project.stages) {
    throw new JawsError('Project\'s jaws.json is malformed or has no existing stages object defined');
  }

  // Check stage and region have been submitted
  if (!_this._stage || !_this._region) {
    throw new JawsError('Stage and region are required');
  }

  // Stage Validations
  if (_this._type === 'stage') {

    // Make sure stage is not already defined
    if (_this._JAWS._meta.projectJson.project.stages[_this._stage]) {
      throw new JawsError('Stage "' + _this._stage + '" is already defined in this project');
    }

    // Make sure stage is not already defined in s3 env var - don't want to overwrite it
    var envCmd = require('./env');
    return envCmd.getEnvFileAsMap(_this._JAWS, _this._stage)
        .then(function(envMap) {
          if (Object.keys(envMap).length > 0) {
            throw new JawsError( 'Stage "' + _this._stage + '" can not be created as an env var file already exists');
          }
        });
  }

  // Region Validations
  if (_this._type === 'region') {

    // Make sure region is not already defined
    var regions = Object.keys(_this._JAWS._meta.projectJson.project.stages[_this._stage]);
    if (regions.indexOf(_this._region) > -1) {
      throw new JawsError('Region "' + _this._region + '" is already defined in the stage "' + _this._stage + '"');
    }
  }

  return Promise.resolve();
});

/**
 * CMD: Create ENV File
 */

CMD.prototype._createEnvFile = Promise.method(function() {

  var _this = this;

  // If type is not stage, skip this
  if (_this._type !== 'stage') return;

  var envFileContents = 'JAWS_STAGE=' + _this._stage
      + '\nJAWS_DATA_MODEL_PREFIX=' + _this._stage;

  return AWSUtils.putEnvFile(
      _this._JAWS._meta.profile,
      _this._JAWS._meta.projectJson.project.envVarBucket.region,
      _this._JAWS._meta.projectJson.project.envVarBucket.name,
      _this._JAWS._meta.projectJson.name,
      _this._stage,
      envFileContents);
});

/**
 * CMD: Create CF Stack
 */

CMD.prototype._createCfStack = Promise.method(function() {

  var _this = this;

  // Start loading icon
  var spinner = JawsCli.spinner(
      'Creating CloudFormation stack "'
      + _this._stage
      + '" - "'
      + _this._region
      + '"');
  spinner.start();

  return AWSUtils.cfCreateStack(
      _this._JAWS._meta.profile,
      _this._region,
      _this._JAWS._meta.projectRootPath,
      _this._JAWS._meta.projectJson.name,
      _this._stage,
      ''  // TODO: read email out of existing jaws-cf.json?
  )
      .then(function(cfData) {
        return AWSUtils.monitorCfCreate(cfData, _this._JAWS._meta.profile, _this._region)
            .then(function(cfData) {
              _this._cfData = cfData;
              spinner.stop(true);
              JawsCli.log('CloudFormation Stack "' + cfData.StackName + '" successfully created.');
            });
      });
});

/**
 * CMD: Update Project JSON
 */

CMD.prototype._updateProjectJson = Promise.method(function() {

  var _this = this;

  var regionObj = {
    region: _this._region,
  };

  for (var i = 0; i < _this._cfData.Outputs.length; i++) {
    if (_this._cfData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
      regionObj.IamRoleArnLambda = _this._cfData.Outputs[i].OutputValue;
    }

    if (_this._cfData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
      regionObj.iamRoleArnApiGateway = _this._cfData.Outputs[i].OutputValue;
    }
  }

  if (_this._JAWS._meta.projectJson.project.stages[_this._stage]) {
    _this._JAWS._meta.projectJson.project.stages[_this._stage].push(regionObj);
  } else {
    _this._JAWS._meta.projectJson.project.stages[_this._stage] = [regionObj];
  }

  return utils.writeFile(
      path.join(_this._JAWS._meta.projectRootPath, 'jaws.json'),
      JSON.stringify(_this._JAWS._meta.projectJson, null, 2));
});