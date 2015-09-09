/**
 * JAWS Command: dash
 */

var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils/index'),
    tagCmd = require('./tag');


/**
 * Command Class
 * @param projectJson
 * @param stage
 * @param region
 * @constructor
 */
function CMD(projectJson, projectRootPath, stage, region) {
  this._projectJson = projectJson;
  this._projectRootPath = projectRootPath;
  this._stage = stage;
  this._region = region;
  this._choices = [];
};

/**
 * Prompt: Stage
 */
CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  if (!_this._stage) {

    var stages = Object.keys(_this._projectJson.project.stages);

    // Check if project has stages
    if (!stages.length) {
      throw new JawsError('This project has no stages');
    }

    // Create Choices
    var choices = [];
    for (var i = 0; i < stages.length; i++) {
      choices.push({
        key: (i + 1) + ') ',
        value: stages[i],
      });
    }

    return JawsCLI.select('Choose a stage: ', choices, false)
        .then(function(results) {
          _this._stage = results[0].value;
        });
  }
});

/**
 * Prompt: Region
 */
CMD.prototype._promptRegion = Promise.method(function() {

  var _this = this;

  if (!_this._region) {
    var regions = _this._projectJson.project.stages[_this._stage].map(function(s) {
      return s.region;
    });

    // Check if stage has regions
    if (!regions.length) {
      throw new JawsError('This stage has no regions');
    }

    // Create Choices
    var choices = [];
    for (var i = 0; i < regions.length; i++) {
      choices.push({
        key: (i + 1) + ') ',
        value: regions[i],
      });
    }

    return JawsCLI.select('Choose a region within this stage: ', choices, false)
        .then(function(results) {
          _this._region = results[0].value;
        });
  }
});

/**
 * Collect Choices
 */
CMD.prototype._collectChoices = Promise.method(function() {
  var _this = this;

  return utils.findAllJawsJsons(_this._projectRootPath)
      .then(function(jsonPaths) {

        // Prepare choices from json modules
        for (var i = 0; i < jsonPaths.length; i++) {

          // Add modules
          var json = require(jsonPaths[i]);

          // Add Spacer
          if (json.lambda || json.endpoint) {
            _this._choices.push({ spacer: true });
          }

          // Add Lambda
          if (json.lambda) {
            _this._choices.push({
              key: 'L) ',
              value: json.lambda.functionName,
            });
          }

          // Add Endpoint
          if (json.endpoint) {
            _this._choices.push({
              key: 'E) ',
              value: json.endpoint.path + ' - ' + json.endpoint.method.toUpperCase(),
            });
          }
        }
      });
});

/**
 * Render Dash
 */
CMD.prototype._renderDash = Promise.method(function() {

  var _this = this;

  return JawsCLI.select(
      'Dashboard for "' + _this._stage + ' - ' + _this._region + '"',
      _this._choices,
      true,
      '- - - - -');
});

/**
 * Run
 */
CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._promptStage()
      .bind(_this)
      .then(_this._promptRegion)
      .then(_this._collectChoices)
      .then(_this._renderDash)
});

module.exports.run = function(JAWS, stage, region) {
  var command = new CMD(JAWS._meta.projectJson, JAWS._meta.projectRootPath, stage, region);
  return command.run();
};