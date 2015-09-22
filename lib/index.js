'use strict';

var path = require('path'),
    utils = require('./utils/index'),
    JawsCLI = require('./utils/cli'),
    JawsError = require('./jaws-error'),
    Promise = require('bluebird'),
    AWSUtils = require('./utils/aws');

/**
 * JAWS Command Line Interface - A CLI to help with JAWS framework operations
 *
 * @constructor
 */
function Jaws() {
  var _this = this;

  _this._meta = {
    version: require('./../package.json').version,
    projectRootPath: utils.findProjectRootPath(process.cwd()),
    projectJson: false,
  };

  if (_this._meta.projectRootPath) {
    _this._meta.projectJson = require(_this._meta.projectRootPath + '/jaws.json');

    // Don't display dotenv load failures for admin.env if we already have the required
    // environment variables.
    var silent = !!process.env.ADMIN_AWS_PROFILE;
    require('dotenv').config({
      silent: silent,
      path: path.join(_this._meta.projectRootPath, 'admin.env'),
    });
    _this._meta.profile = process.env.ADMIN_AWS_PROFILE;
    _this._meta.credentials = AWSUtils.profilesGet(_this._meta.profile)[_this._meta.profile];
  }
}

Jaws.prototype.constructor = Jaws;

/**
 * Validate Project
 * Ensures:
 * - valid JAWS project found
 * - proj jaws.json has one valid region and stage
 * @returns {Promise} true if validates
 */

Jaws.prototype.validateProject = Promise.method(function() {
  var _this = this;

  if (!_this._meta.projectRootPath) {
    throw new JawsError('Must be in a JAWS project', JawsError.errorCodes.NOT_IN_JAWS_PROJECT);
  }

  if (!_this._meta.projectJson || !_this._meta.projectJson.stages) {
    throw new JawsError(
        'JAWS project must have at least one stage and region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  var stages = Object.keys(_this._meta.projectJson.stages);
  if (!stages || !stages.length) {
    throw new JawsError(
        'JAWS project must have at least one stage and region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  var hasOneRegion = stages.some(function(stageName) {
    return !!_this._meta.projectJson.stages[stageName][0].region;
  });

  if (!hasOneRegion) {
    throw new JawsError(
        'JAWS project must have at least one region defined',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }
});

/**
 * Get ENV File
 */

Jaws.prototype.getEnvFile = Promise.method(function(region, stage) {
  var _this = this,
      bucket = _this._meta.projectJson.jawsBuckets[region];

  JawsCLI.log('Getting ENV file from S3 bucket: ' + bucket + ' in ' + region);

  return AWSUtils.getEnvFile(
      _this._meta.profile,
      region,
      bucket,
      _this._meta.projectJson.name,
      stage);
});

/**
 * Put ENV File
 */

Jaws.prototype.putEnvFile = Promise.method(function(region, stage, contents) {
  var _this = this,
      bucket = _this._meta.projectJson.jawsBuckets[region];

  JawsCLI.log('Uploading ENV file from S3 bucket: ' + bucket + ' in ' + region);

  return AWSUtils.putEnvFile(
      _this._meta.profile,
      region,
      bucket,
      _this._meta.projectJson.name,
      stage,
      contents);
});

module.exports = Jaws;
