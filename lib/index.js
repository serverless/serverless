'use strict';

var path = require('path'),
    utils = require('./utils/index'),
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

module.exports = Jaws;
