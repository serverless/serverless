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
    utils = require('../utils');

Promise.promisifyAll(fs);

/**
 *
 * @param JAWS
 * @param type 'stage'|'region'
 * @param stage
 * @param region Optional. Will be prompted for if omitted
 * @param s3Bucket Optional. only valid for type of region
 * @param noCf Optional
 * @returns {*}
 */
module.exports.run = function(JAWS, type, stage, region, s3Bucket, noCf) {
  var command = new CMD(JAWS, type, stage, region, s3Bucket, noCf);
  return command.run();
};

/**
 * Command Class
 * @constructor
 */
function CMD(JAWS, type, stage, region, s3Bucket, noCf) {
  this._JAWS = JAWS;
  this._type = type;
  this._stage = stage;
  this._region = region;
  this._s3Bucket = s3Bucket;
  this._noCf = noCf;
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCli.prompt();
  this.Prompter.override = {};
  this._spinner = null;
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  // Status
  if (_this._type === 'stage') JawsCli.log('Creating new stage "' + _this._stage + '"...');
  if (_this._type === 'region') JawsCli.log('Creating new region within stage "' + _this._stage + '"...');

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._promptRegion)
      .then(function() {
        if (_this._type == 'stage') { //if stage we now have region, so we know bucket
          _this._s3Bucket = _this._JAWS._meta.projectJson.jawsBuckets[_this._region];
        } else {
          return _this._promptJawsS3Bucket();
        }
      })
      .then(_this._validate)
      .then(_this._createEnvFile)
      .then(function() {
        return utils.generateResourcesCf(
            _this._JAWS._meta.projectRootPath,
            _this._JAWS._meta.projectJson.name,
            _this._stage,
            _this._region,
            ''
        );
      })
      .then(function() {
        if (_this._noCf) {
          JawsCli.log('ENV var file created in s3. CloudFormation file can be run manually');
          JawsCli.log('!!MAKE SURE!! to create stack with name: ' + AWSUtils.cfGetResourcesStackName(
                  _this._stage,
                  _this._JAWS._meta.projectJson.name
              ));
          JawsCli.log('After creating CF stack, remember to put the IAM role outputs in your project jaws.json');
          return false;
        } else {
          return _this._createCfStack()
              .then(function(cfData) {
                if (_this._spinner) {
                  _this._spinner.stop(true);
                }
                return cfData;
              });
        }
      })
      .then(_this._updateProjectJson);
});

/**
 * CMD: Prompt: Region
 */

CMD.prototype._promptRegion = Promise.method(function() {
  var _this = this,
      msg = 'Choose a region lambda supports: ',
      validRegions = [
        'us-east-1',
        'us-west-1',
        'us-west-2',
        'eu-west-1',
        'ap-northeast-1',
      ];

  if (_this._type == 'stage') { //must use existing region
    validRegions = Object.keys(_this._JAWS._meta.projectJson.jawsBuckets);
    if (validRegions.length == 1) {
      _this._region = validRegions[0];
      return Promise.resolve();
    }
    msg = 'Choose an existing project region: ';
  }

  if (validRegions.indexOf(_this._region) != -1) {  //they specified region and its valid
    return Promise.resolve();
  }

  // Create Choices
  var choices = [];
  for (var i = 0; i < (validRegions.length + 1); i++) {
    choices.push({
      key: (i + 1) + ') ',
      value: validRegions[i],
      label: validRegions[i],
    });
  }

  return JawsCli.select(msg, choices, false)
      .then(function(results) {
        _this._region = [results[0].value];
      });
});

CMD.prototype._promptJawsS3Bucket = Promise.method(function() {
  var _this = this;
  if (_this._s3Bucket) return;

  //Don't ever auto-create s3 bucket as its against best practice, and this is not the quick start path

  // Prompt: s3 bucket - holds env vars for this project
  _this.Prompter.override.s3Bucket = _this._s3Bucket;
  _this._prompts.properties.s3Bucket = {
    description: 'Enter EXISTING s3 bucket for this region. MUST be in ' + _this._region + ': '.yellow,
    default: 'jaws.yourapp.com',
    message: 'Bucket name must only contain lowercase letters, numbers, periods and dashes',
    conform: function(bucket) {
      var re = /^[a-z0-9-.]+$/;
      return re.test(bucket);
    },
  };

  return new Promise(function(resolve, reject) {
    _this.Prompter.get(_this._prompts, function(err, answers) {
      if (err) {
        reject(new JawsError(err));
      }
      resolve(answers);
    });
  })
      .then(function(answers) {
        _this._s3Bucket = answers.s3Bucket;
      });
});

/**
 * CMD: Validate
 */

CMD.prototype._validate = Promise.method(function() {

  var _this = this;

  // Check project config is valid
  if (!_this._JAWS._meta.projectJson.stages) {
    throw new JawsError('Project\'s jaws.json is malformed or has no existing stages object defined');
  }

  // Check stage and region have been submitted
  if (!_this._stage || !_this._region) {
    throw new JawsError('Stage and region are required');
  }

  // Stage Validations
  if (_this._type === 'stage') {

    // Make sure stage is not already defined
    if (_this._JAWS._meta.projectJson.stages[_this._stage]) {
      throw new JawsError('Stage "' + _this._stage + '" is already defined in this project');
    }

    // Make sure stage is not already defined in s3 env var - don't want to overwrite it
    var envCmd = require('./env');
    return envCmd.getEnvFileAsMap(_this._JAWS, _this._stage, _this._region)
        .then(function(envMap) {
          if (Object.keys(envMap).length > 0) {
            throw new JawsError('Stage "' + _this._stage + '" can not be created as an env var file already exists');
          }
        });
  }

  // Region Validations
  if (_this._type === 'region') {

    // Make sure region is not already defined
    var regions = Object.keys(_this._JAWS._meta.projectJson.stages[_this._stage]);
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

  var envFileContents = 'JAWS_STAGE=' + _this._stage
      + '\nJAWS_DATA_MODEL_PREFIX=' + _this._stage;

  return AWSUtils.putEnvFile(
      _this._JAWS._meta.profile,
      _this._region,
      _this._s3Bucket,
      _this._JAWS._meta.projectJson.name,
      _this._stage,
      envFileContents);
});

/**
 * CMD: Create CF Stack
 */

CMD.prototype._createCfStack = Promise.method(function() {

  var _this = this;

  _this._spinner = JawsCli.spinner(
      'Creating CloudFormation stack for stage: "'
      + _this._stage
      + '" and region: "'
      + _this._region
      + '" (~5 mins)');
  _this._spinner.start();

  return AWSUtils.cfCreateResourcesStack(
          _this._JAWS._meta.profile,
          _this._region,
          _this._JAWS._meta.projectRootPath,
          _this._JAWS._meta.projectJson.name,
          _this._stage,
          _this._JAWS._meta.projectJson.jawsBuckets[_this._region],
          ''  // TODO: read email out of existing jaws-cf.json?
      )
      .then(function(cfData) {
        return AWSUtils.monitorCf(cfData, _this._JAWS._meta.profile, _this._region, 'create');
      });
});

/**
 * CMD: Update Project JSON
 */

CMD.prototype._updateProjectJson = Promise.method(function(cfData) {

  var _this = this;

  var regionObj = {
    region: _this._region,
    iamRoleArnLambda: '',
    iamRoleArnApiGateway: '',
  };

  if (cfData) {
    for (var i = 0; i < cfData.Outputs.length; i++) {
      if (cfData.Outputs[i].OutputKey === 'IamRoleArnLambda') {
        regionObj.IamRoleArnLambda = cfData.Outputs[i].OutputValue;
      }

      if (cfData.Outputs[i].OutputKey === 'IamRoleArnApiGateway') {
        regionObj.iamRoleArnApiGateway = cfData.Outputs[i].OutputValue;
      }
    }
  }

  if (_this._JAWS._meta.projectJson.stages[_this._stage]) {
    _this._JAWS._meta.projectJson.stages[_this._stage].push(regionObj);
  } else {
    _this._JAWS._meta.projectJson.stages[_this._stage] = [regionObj];
  }

  return utils.writeFile(
      path.join(_this._JAWS._meta.projectRootPath, 'jaws.json'),
      JSON.stringify(_this._JAWS._meta.projectJson, null, 2));
});
