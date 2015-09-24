'use strict';

/**
 * JAWS Command: deploy resources <stage> <region>
 * - Deploys project's API Gateway REST API to the specified stage and one or all regions
 */


var JawsError = require('../jaws-error'),
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

module.exports.run = function(JAWS, stage, region, allTagged) {
  var command = new CMD(JAWS, stage, region, allTagged);
  return command.run();
};

/**
 * CMD Class
 * @param JAWS
 * @param stage
 * @param region
 * @param allTagged
 * @constructor
 */

function CMD(JAWS, stage, region, allTagged) {
  var _this = this;
  _this._stage = stage;
  _this._allTagged = allTagged;
  _this._JAWS = JAWS;
  _this._prjJson = JAWS._meta.projectJson;
  _this._prjRootPath = JAWS._meta.projectRootPath;
  _this._prjCreds = JAWS._meta.credentials;

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

  var _this = this;

  // Flow
  return _this._JAWS.validateProject()
      .bind(_this)
      .then(function() {
        // If !allTagged, tag current directory
        if (!_this._allTagged) {
          return CMDtag.tag('endpoint', null, false);
        }
      })
      .then(_this._promptStage)
      .then(_this._promptRegions)
      .then(function() {
        return _this._regions;
      })
      .each(function(regionJson) {

        JawsCli.log('Endpoint Deployer:  Deploying endpoint(s) to region "' + regionJson.region + '"...');

        var deployer = new ApiDeployer(
            _this._JAWS,
            _this._stage,
            regionJson,
            _this._prjRootPath,
            _this._prjJson,
            _this._prjCreds
        );

        return deployer.deploy()
            .then(function(url) {
              JawsCli.log('Endpoint Deployer:  Endpoints for stage "'
                  + _this._stage
                  + '" successfully deployed to API Gateway in the region "'
                  + regionJson.region
                  + '". Access them @ '
                  + url);
            });
      })
      .then(function() {
        // Untag All tagged endpoints
        return _this._allTagged ? CMDtag.tagAll(_this._JAWS, 'endpoint', true) : CMDtag.tag('endpoint', null, true);
      });
});

/**
 * CMD: Prompt Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage, skip
  if (_this._stage) return;

  var stages = Object.keys(_this._prjJson.stages);
  if (!stages.length) {
    throw new JawsError('You have no stages in this project');
  }

  // If project has only one stage, skip select
  if (stages.length === 1) {
    _this._stage = stages[0];
    return;
  }

  var choices = [];
  for (var i = 0; i < stages.length; i++) {
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

  var _this = this;

  // If regions, skip
  if (_this._regions && _this._regions.length) return;

  var regions =  _this._JAWS._meta.projectJson.stages[_this._stage];

  // If stage has only one region, skip select
  if (regions.length === 1) {
    _this._regions = regions;
    return;
  }

  var choices = [];
  for (var i = 0; i < regions.length; i++) {
    choices.push({
      key: '',
      value: regions[i].region,
      label: regions[i].region,
    });
  }

  return JawsCli.select('Select a region in this stage to deploy to: ', choices, false);
});

