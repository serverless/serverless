'use strict';

/**
 * JAWS Command: deploy resources <stage> <region>
 * - Deploys project's resources-cf.json
 */

let JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    async = require('async'),
    path = require('path'),
    utils = require('../utils/index'),
    AWSUtils = require('../utils/aws'),
    CMDtag = require('./tag');

Promise.promisifyAll(fs);

/**
 * Run
 * @param JAWS
 * @param stage
 * @param region
 * @param allTagged
 * @returns {*}
 */

module.exports.run = function(JAWS, stage, region) {
  let command = new CMD(JAWS, stage, region);
  return command.run();
};

/**
 * CMD Class
 * @param JAWS
 * @param stage
 * @param region
 * @constructor
 */

function CMD(JAWS, stage, region) {
  let _this = this;
  _this._stage = stage;
  _this._JAWS = JAWS;

  if (region && stage) {
    _this._regions = _this._JAWS._meta.projectJson.stages[_this._stage].filter(function(r) {
      return (r.region == region);
    });
  } else if (stage) {
    _this._regions = _this._JAWS._meta.projectJson.stages[_this._stage];
  }
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  let _this = this;

  // Flow
  return _this._JAWS.validateProject()
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

        return deployer.deploy();
      });
});

/**
 * CMD: Prompt Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  let _this = this;

  // If stage, skip
  if (_this._stage) return;

  let stages = Object.keys(_this._JAWS._meta.projectJson.stages);
  if (!stages.length) {
    throw new JawsError('You have no stages in this project');
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
});

/**
 * CMD: Prompt Regions
 */

CMD.prototype._promptRegions = Promise.method(function() {

  let _this = this;

  // If regions, skip
  if (_this._regions && _this._regions.length) return;

  let regions = _this._JAWS._meta.projectJson.stages[_this._stage];

  // If stage has only one region, skip select
  if (regions.length === 1) {
    _this._regions = regions;
    return;
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
});

/**
 * Resource Deployer
 * @param JAWS
 * @param stage
 * @param region
 * @constructor
 */

function ResourceDeployer(JAWS, stage, region) {

  let _this = this;
  _this._JAWS = JAWS;
  _this._stage = stage;
  _this._regionJson = region;

}

/**
 * Resource Deployer: Deploy
 */

ResourceDeployer.prototype.deploy = Promise.method(function() {

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
});

/**
 * Resource Deployer: Update Stack
 */

ResourceDeployer.prototype._updateStack = function() {

  let _this = this;

  // Fetch Cloudformation template
  return AWSUtils.cfUpdateResourcesStack(
      _this._JAWS,
      _this._stage,
      _this._regionJson.region);
};
