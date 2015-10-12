'use strict';

let path = require('path'),
    utils = require('./utils/index'),
    JawsCLI = require('./utils/cli'),
    JawsError = require('./jaws-error'),
    Promise = require('bluebird'),
    AWSUtils = require('./utils/aws');

/**
 * JAWS Command Line Interface - A CLI to help with JAWS framework operations
 *
 * @type {Jaws}
 */
let Jaws = class Jaws {
  constructor() {
    let _this = this;

    this._meta = {
      version: require('./../package.json').version,
      projectRootPath: utils.findProjectRootPath(process.cwd()),
      projectJson: false,
    };

    if (this._meta.projectRootPath) {
      this._meta.projectJson = require(_this._meta.projectRootPath + '/jaws.json');

      // Don't display dotenv load failures for admin.env if we already have the required
      // environment letiables.
      let silent = !!process.env.ADMIN_AWS_PROFILE;
      require('dotenv').config({
        silent: silent,
        path: path.join(_this._meta.projectRootPath, 'admin.env'),
      });
      this._meta.profile = process.env.ADMIN_AWS_PROFILE;
      this._meta.credentials = AWSUtils.profilesGet(_this._meta.profile)[_this._meta.profile];
    }
  }

  /**
   * Validate Project
   * Ensures:
   * - valid JAWS project found
   * - proj jaws.json has one valid region and stage
   *
   * @returns {Promise} true if validates
   */
  validateProject() {
    let _this = this;

    if (!this._meta.projectRootPath) {
      return Promise.reject(new JawsError('Must be in a JAWS project', JawsError.errorCodes.NOT_IN_JAWS_PROJECT));
    }

    if (!this._meta.projectJson || !_this._meta.projectJson.stages) {
      return Promise.reject(new JawsError(
          'JAWS project must have at least one stage and region defined',
          JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    let stages = Object.keys(_this._meta.projectJson.stages);
    if (!stages || !stages.length) {
      return Promise.reject(new JawsError(
          'JAWS project must have at least one stage and region defined',
          JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    let hasOneRegion = stages.some(function(stageName) {
      return !!_this._meta.projectJson.stages[stageName][0].region;
    });

    if (!hasOneRegion) {
      return Promise.reject(new JawsError(
          'JAWS project must have at least one region defined',
          JawsError.errorCodes.INVALID_PROJECT_JAWS
      ));
    }

    return Promise.resolve();
  }

  /**
   * Get env file for region and stage
   *
   * @param region
   * @param stage
   * @returns {Promise}
   */
  getEnvFile(region, stage) {
    let _this = this,
        bucket = _this.getJawsBucket(region, stage);

    JawsCLI.log(`Getting ENV file from S3 bucket: ${bucket} in ${region}`);
    return AWSUtils.getEnvFile(
        _this._meta.profile,
        region,
        bucket,
        _this._meta.projectJson.name,
        stage);
  }

  /**
   * Put env file contents to region + stage file
   *
   * @param region
   * @param stage
   * @param contents
   */
  putEnvFile(region, stage, contents) {

    let _this = this,
        bucket = _this.getJawsBucket(region, stage);

    JawsCLI.log(`Uploading ENV file from S3 bucket: ${bucket} in ${region}`);

    return AWSUtils.putEnvFile(
        _this._meta.profile,
        region,
        bucket,
        _this._meta.projectJson.name,
        stage,
        contents);
  }

  /**
   * Get JawsBucket
   * @param region
   * @param stage
   * @returns {Promise} string jaws bucket
   */
  getJawsBucket(region, stage) {

    let _this = this,
        projConfig = utils.getProjRegionConfigForStage(_this._meta.projectJson, stage, region);

    return projConfig.jawsBucket;
  }
};

module.exports = Jaws;
