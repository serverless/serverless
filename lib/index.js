'use strict';

var path = require('path'),
    utils = require('./utils/index'),
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
    require('dotenv').config({
      path: path.join(_this._meta.projectRootPath, 'admin.env'),
    });
    _this._meta.profile = process.env.ADMIN_AWS_PROFILE;
    _this._meta.credentials = AWSUtils.profilesGet(_this._meta.profile)[_this._meta.profile];
  }
}

Jaws.prototype.constructor = Jaws;

/**
 * Makes sure:
 * - valid JAWS project found
 * - proj jaws.json has one valid region and stage
 *
 * @param checkDupeLambdas default false. Careful this could be slow if large project
 * @returns {Promise} true if validates
 */
Jaws.prototype.validateProject = Promise.method(function(checkDupeLambdas) {
  var _this = this;

  if (!_this._meta.projectRootPath) {
    throw new JawsError('Must be in a JAWS project', JawsError.errorCodes.NOT_IN_JAWS_PROJECT);
  }

  if (!_this._meta.projectJson || !_this._meta.projectJson.project || !_this._meta.projectJson.stages) {
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

  if (checkDupeLambdas) {
    return utils.checkForDuplicateLambdaNames(_this._meta.projectRootPath);
  } else {
    return true;
  }
});

module.exports = Jaws;
