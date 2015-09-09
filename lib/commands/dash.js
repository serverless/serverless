/**
 * JAWS Command: dash
 */

var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    chalk = require('chalk'),
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

        var modules = [];

        // Fetch and prepare json modules
        for (var i = 0; i < jsonPaths.length; i++) {

          // Add modules
          var json = require(jsonPaths[i]);
          var module = {};

          // Add Lambda
          if (json.lambda) {

            // Parse lambda path
            var paths = jsonPaths[i].split('/');
            paths = paths[paths.length - 3] + '/' + paths[paths.length - 2];
            paths = chalk.grey(' in ' + paths);

            module.lambda = json.lambda.functionName + paths;
          }

          // Add Endpoint
          if (json.endpoint) {
            module.endpoint = json.endpoint.path + chalk.grey(' - ' + json.endpoint.method);
          }

          modules.push(module);
        }

        // Sort by endpoint path
        modules.sort(function(a, b) {
          return (a.endpoint < b.endpoint) ? -1 : (a.endpoint > b.endpoint) ? 1 : 0;
        });

        // Prepare Choices
        for (var i = 0; i < modules.length; i++) {

          if (modules[i].lambda || modules[i].endpoint) {
            _this._choices.push({
              spacer: true,
            });
          }

          if (modules[i].lambda) {
            _this._choices.push({
              key: 'L) ',
              value: modules[i].lambda,
              type: 'lambda'
            });
          }

          if (modules[i].endpoint) {
            _this._choices.push({
              key: 'E) ',
              value: modules[i].endpoint,
              type: 'endpoint'
            });
          }
        }

        // Remove first spacer
        _this._choices.splice(0, 1);
      });
});

/**
 * Show Summary
 */
CMD.prototype._prepareSummary = Promise.method(function() {

  var _this = this;
  var lambdaCount = 0;
  var endpointCount = 0;

  for (var i = 0; i < _this._choices.length; i++) {
    if (_this._choices[i].type === 'lambda') lambdaCount++;
    if (_this._choices[i].type === 'endpoint') endpointCount++;
  }

  _this._summary = 'DASHBOARD' + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white(' Project Summary') + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white('    Lambdas: ' + lambdaCount) + os.EOL
      + chalk.white('    Endpoints: ' + endpointCount) + os.EOL
      + chalk.white('    Target Stage: ' + _this._stage) + os.EOL
      + chalk.white('    Target Region: ' + _this._region) + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white(' Select Resources To Deploy') + os.EOL
      + chalk.white.bold(' -------------------------------------------');
});

/**
 * Render Dash
 */
CMD.prototype._renderDash = Promise.method(function() {

  var _this = this;

  return JawsCLI.select(
      _this._summary,
      _this._choices,
      true,
      '- - - - -',
      'Deploy Selected');
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
      .then(_this._prepareSummary)
      .then(_this._renderDash);
});

module.exports.run = function(JAWS, stage, region) {
  var command = new CMD(JAWS._meta.projectJson, JAWS._meta.projectRootPath, stage, region);
  return command.run();
};