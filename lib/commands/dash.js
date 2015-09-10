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
function CMD(JAWS, stage, region) {
  this._JAWS = JAWS;
  this._stage = stage;
  this._region = region;
  this._choices = [];
};

/**
 * Prompt: Stage
 */
CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage exists, skip
  if (_this._stage) return;

  var stages = Object.keys(_this._JAWS._meta.projectJson.project.stages);

  // Check if project has stages
  if (!stages.length) {
    throw new JawsError('This project has no stages');
  }

  // If project only has 1 stage, skip prompt
  if (stages.length === 1) {
    _this._stage = stages[0];
    return;
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
});

/**
 * Prompt: region
 */
CMD.prototype._promptRegion = Promise.method(function() {

  var _this = this;

  // If region exists, skip
  if (_this._region) return;

  var regions = _this._JAWS._meta.projectJson.project.stages[_this._stage].map(function(s) {
    return s.region;
  });

  // Check if stage has regions
  if (!regions.length) {
    throw new JawsError('This stage has no regions');
  }

  // If stage only has 1 region, skip prompt
  if (regions.length === 1) {
    _this._region = regions[0];
    return;
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
});

/**
 * Prepare Resources
 */
CMD.prototype._prepareResources = Promise.method(function() {
  var _this = this;

  return utils.findAllJawsJsons(_this._JAWS._meta.projectRootPath)
      .then(function(jsonPaths) {

        var hybrids = [];
        var lambdas = [];

        // Fetch and prepare json modules
        for (var i = 0; i < jsonPaths.length; i++) {

          // Add modules
          var json = require(jsonPaths[i]);
          var module = {};

          // Add Lambda
          if (json.lambda) {

            module.lambda = {
              key: 'L) ',
              value: jsonPaths[i],
              type: 'lambda',
            };

            // Create label
            var paths = jsonPaths[i].split('/');
            paths = paths[paths.length - 3] + '/' + paths[paths.length - 2];
            paths = chalk.grey(' in ' + paths);
            module.lambda.label = json.lambda.functionName + paths;
          }

          // Add Endpoint
          if (json.endpoint) {
            module.endpoint = {
              key: 'E) ',
              value: jsonPaths[i],
              type: 'endpoint',
              label: json.endpoint.path + chalk.grey(' - ' + json.endpoint.method),
            };
          }

          if (module.lambda && module.endpoint) hybrids.push(module);
          if (module.lambda && !module.endpoint) lambdas.push(module);
        }

        // Sort hybrids by label/paths
        hybrids.sort(function(a, b) {
          return (a.label < b.label) ? -1 : (a.label > b.label) ? 1 : 0;
        });

        // Sort lambdas by label
        lambdas.sort(function(a, b) {
          return (a.label < b.label) ? -1 : (a.label > b.label) ? 1 : 0;
        });

        // Add Lambdas back in
        var modules = lambdas.concat(hybrids);

        // Prepare Choices
        for (var i = 0; i < modules.length; i++) {

          if (modules[i].lambda) {
            _this._choices.push(modules[i].lambda);
          }
          if (modules[i].endpoint) {
            _this._choices.push(modules[i].endpoint);
          }

          _this._choices.push({
            spacer: true,
          });
        }

        // Remove last spacer
        _this._choices.splice( _this._choices.length - 1, 1);
      });
});

/**
 * Show Summary
 */
CMD.prototype._prepareSummary = Promise.method(function() {

  var _this = this;
  var lambdaCount = 0;
  var endpointCount = 0;

  // Count Lambdas and Endpoints
  for (var i = 0; i < _this._choices.length; i++) {
    if (_this._choices[i].type === 'lambda') lambdaCount++;
    if (_this._choices[i].type === 'endpoint') endpointCount++;
  }

  _this._summary = 'Dashboard for project "' + _this._JAWS._meta.projectJson.name + '"' + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white(' Project Summary') + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white('    Stages: ' + os.EOL);

  // Add Stage Data
  for (var stage in _this._JAWS._meta.projectJson.project.stages) {

    _this._summary = _this._summary
        + chalk.white('       ' + stage + ' ');

    for (var i = 0; i < _this._JAWS._meta.projectJson.project.stages[stage].length; i++) {
      _this._summary = _this._summary
          + chalk.grey(_this._JAWS._meta.projectJson.project.stages[stage][i].region + ' ')
    }

    _this._summary = _this._summary + os.EOL;
  }

  _this._summary = _this._summary
      + chalk.white('    Lambdas: ' + lambdaCount) + os.EOL
      + chalk.white('    Endpoints: ' + endpointCount) + os.EOL
      + chalk.white.bold(' -------------------------------------------') + os.EOL
      + chalk.white(' Select Resources To Deploy') + os.EOL
      + chalk.white.bold(' -------------------------------------------');
});

/**
 * Render Dash
 */
CMD.prototype._renderDash = Promise.method(function() {

  var _this = this;

  JawsCLI.log(_this._summary);

  return JawsCLI.select(
      null,
      _this._choices,
      true,
      '- - - - -',
      'Deploy Selected -->');
});

/**
 * Run
 */
CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return Promise.try(function(){})
      .bind(_this)
      .then(_this._prepareResources)
      .then(_this._prepareSummary)
      .then(_this._renderDash)
      .then(function(resources) {
        console.log(resources);
      });
});

module.exports.run = function(JAWS, stage, region) {
  var command = new CMD(JAWS, stage, region);
  return command.run();
};