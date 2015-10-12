'use strict';

/**
 * JAWS Command: deploy resources <stage> <region>
 * - Deploys project's resources-cf.json
 */

let ProjectCmd = require('./ProjectCmd.js'),
    JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    async = require('async'),
    path = require('path'),
    utils = require('../utils/index'),
    AWSUtils = require('../utils/aws'),
    CMDtag = require('./Tag');

Promise.promisifyAll(fs);

var CMD = class DeployResources extends ProjectCmd {

  /**
   *
   * @param JAWS
   * @param stage
   * @param region
   */
  constructor(JAWS, stage, region) {
    super(JAWS);

    this._stage = stage;

    if (region && stage) {
      this._regions = this._JAWS._meta.projectJson.stages[this._stage].filter(r => {
        return (r.region == region);
      });
    } else if (stage) {
      this._regions = this._JAWS._meta.projectJson.stages[this._stage];
    }
  }

  /**
   * @returns {Promise}
   */
  run() {
    let _this = this;

    return this._JAWS.validateProject()
        .bind(_this)
        .then(_this._promptStage)
        .then(function(answer) {
          if (answer) _this._stage = answer[0].value;
        })
        .then(_this._promptRegions)
        .then(function(answer) {
          if (answer) {
            _this._regions = [utils.getProjRegionConfigForStage(
                _this._JAWS._meta.projectJson,
                _this._stage,
                answer[0].value)];
          }
        })
        .then(function() {
          return _this._regions;
        })
        .each(function(regionJson) {

          JawsCli.log('Resources Deployer  "'
              + _this._stage
              + '": Deploying resources to region "'
              + regionJson.region
              + '"...');

          let deployer = new ResourceDeployer(
              _this._JAWS,
              _this._stage,
              regionJson
          );

          return deployer.run();
        });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStage() {

    let _this = this;

    // If stage, skip
    if (this._stage) return;

    let stages = Object.keys(_this._JAWS._meta.projectJson.stages);
    if (!stages.length) {
      return Promise.reject(new JawsError('You have no stages in this project'));
    }

    // If project has only one stage, skip select
    if (stages.length === 1) {
      _this._stage = stages[0];
      return;
    }

    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key: '',
        value: stages[i],
        label: stages[i]
      });
    }

    return JawsCli.select('Select a stage to deploy to: ', choices, false);
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptRegions() {

    let _this = this;

    // If regions, skip
    if (_this._regions && _this._regions.length) return;

    let regions = _this._JAWS._meta.projectJson.stages[_this._stage];

    // If stage has only one region, skip select
    if (regions.length === 1) {
      _this._regions = regions;
      return Promise.resolve();
    }

    let choices = [];
    for (let i = 0; i < regions.length; i++) {
      choices.push({
        key: '',
        value: regions[i].region,
        label: regions[i].region,
      });
    }

    return JawsCli.select('Select a region in this stage to deploy to: ', choices, false);
  }
};

var ResourceDeployer = class ResourceDeployer extends ProjectCmd {

  /**
   *
   * @param JAWS
   * @param stage
   * @param region
   */
  constructor(JAWS, stage, region) {
    super(JAWS);
    this._stage = stage;
    this._regionJson = region;
  }

  /**
   *
   * @returns {Promise.<T>}
   */
  run() {
    let _this = this;

    JawsCli.log('Resources Deployer  "'
        + _this._stage
        + ' - '
        + _this._regionJson.region
        + '":  Performing Cloudformation stack update.  '
        + 'This could take a while depending on how many resources you are updating...');

    let spinner = JawsCli.spinner();
    spinner.start();

    return _this._updateStack()
        .bind(_this)
        .then(function(cfData) {
          return AWSUtils.monitorCf(cfData, _this._JAWS._meta.profile, _this._regionJson.region, 'update');
        })
        .then(function(data) {
          spinner.stop(true);
          JawsCli.log('Resources Deployer  "'
              + _this._stage
              + ' - '
              + _this._regionJson.region
              + '":  Cloudformation stack update completed successfully!');
        })
        .catch(function(error) {
          spinner.stop(true);
          JawsCli.log('Resources Deployer  "'
              + _this._stage
              + ' - '
              + _this._regionJson.region
              + '":  Cloudformation stack update failed because of the following error...');
          console.log(error);
        });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _updateStack() {

    let _this = this;

    // Fetch Cloudformation template
    return AWSUtils.cfUpdateResourcesStack(
        _this._JAWS,
        _this._stage,
        _this._regionJson.region);
  }
};

/**************************************
 * EXPORTS
 **************************************/

/**
 *
 * @param JAWS
 * @param stage
 * @param region
 */
module.exports.run = function(JAWS, stage, region) {
  let command = new CMD(JAWS, stage, region);
  return command.run();
};

exports.DeployResources = CMD;
module.exports.ResourceDeployer = ResourceDeployer;
