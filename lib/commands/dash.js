/**
 * JAWS Command: dash
 */

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    chalk = require('chalk'),
    utils = require('../utils/index'),
    CMDtag = require('./tag'),
    CMDdeployLambda = require('./deploy_lambda'),
    CMDdeployEndpoint = require('./deploy_endpoint');

/**
 * Run
 * @param JAWS
 * @param stage
 * @param regions
 * @param allTagged
 * @returns {Promise}
 */

module.exports.run = function(JAWS, stage, regions, allTagged) {
  var command = new CMD(JAWS, stage, regions, allTagged);
  return command.run();
};

/**
 *
 * @param JAWS
 * @param stage
 * @param regions
 * @param allTagged
 * @constructor
 */
function CMD(JAWS, stage, regions, allTagged) {
  this._JAWS = JAWS;
  this._allTagged = allTagged || false;
  this._stage = stage || null;
  this._regions = regions || [];
  this._choices = [];
}

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;
  _this._report = {
    targetLambdas: 0,
    targetEndpoints: 0
  };

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(function() {

        // If !allTagged, Show Dashboard

        if (!_this._allTagged) {
          return Promise.try(function() {
              })
              .bind(_this)
              .then(_this._prepareResources)
              .then(_this._prepareSummary)
              .then(_this._renderDash)
              .then(function(selectedResources) {
                _this._resources = selectedResources;
                if (!_this._resources.length) {
                  return false;
                }
                return _this._choices;
              })
              .each(function(resource) {
                var toggled = (!!resource.toggled || false);
                if (resource.type === 'lambda') {
                  _this._report.targetLambdas++;
                  return CMDtag.tag('lambda', resource.value, !toggled);
                } else if (resource.type === 'endpoint') {
                  _this._report.targetEndpoints++;
                  return CMDtag.tag('endpoint', resource.value, !toggled);
                }
              });
        }
      })
      .then(_this._promptStage)
      .then(_this._promptRegion)
      .then(function() {

        // Status
        JawsCli.log(chalk.white('-------------------------------------------'));
        JawsCli.log(chalk.white(' Dashboard:  Deploying Lambdas...'));
        JawsCli.log(chalk.white('-------------------------------------------'));
        if (!_this._report.targetLambdas) {
          return JawsCli.log(chalk.white('No Selected Lambdas to deploy.'));
        }

        return CMDdeployLambda.run(
            _this._JAWS,
            _this._stage,
            _this._regions,
            true);
      })
      .then(function() {

        // Status
        JawsCli.log(chalk.white('-------------------------------------------'));
        JawsCli.log(chalk.white(' Dashboard:  Deploying Endpoints...'));
        JawsCli.log(chalk.white('-------------------------------------------'));
        if (!_this._report.targetEndpoints) {
          return JawsCli.log(chalk.white('No Selected Endpoints to deploy.'));
        }

        return CMDdeployEndpoint.run(
            _this._JAWS,
            _this._stage,
            _this._regions,
            true);
      })
      .then(function() {

        // Status
        JawsCli.log(chalk.white('-------------------------------------------'));
        JawsCli.log(chalk.white(' Dashboard:  Deployments Completed'));
        JawsCli.log(chalk.white('-------------------------------------------'));
      });
});

/**
 * CMD: Prepare Resources
 */

CMD.prototype._prepareResources = Promise.method(function() {
  var _this = this;

  return utils.findAllAwsmJsons(_this._JAWS._meta.projectRootPath)
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
              key: '  L) ',
              value: jsonPaths[i],
              type: 'lambda',
              label: json.lambda.functionName,
            };

            // Create path
            var paths = jsonPaths[i].split('/');
            paths = paths[paths.length - 3] + '/' + paths[paths.length - 2];
            module.lambda.path = chalk.grey(paths);
          }

          // Add Endpoint
          if (json.endpoint) {
            module.endpoint = {
              key: '  E) ',
              value: jsonPaths[i],
              type: 'endpoint',
              label: '/' + json.endpoint.path + ' - ' + json.endpoint.method,
            };

            // Create path
            var paths = jsonPaths[i].split('/');
            paths = paths[paths.length - 3] + '/' + paths[paths.length - 2];
            module.endpoint.path = chalk.grey(paths);
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

          if (modules[i].lambda || modules[i].endpoint) {
            _this._choices.push({
              spacer: modules[i].lambda.path ? modules[i].lambda.path : modules[i].endpoint.path,
            });
          }
          if (modules[i].lambda) {
            _this._choices.push(modules[i].lambda);
          }
          if (modules[i].endpoint) {
            _this._choices.push(modules[i].endpoint);
          }
        }
      });
});

/**
 * CMD: Prepare Summary
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
  for (var stage in _this._JAWS._meta.projectJson.stages) {

    _this._summary = _this._summary
        + chalk.white('       ' + stage + ' ');

    for (var i = 0; i < _this._JAWS._meta.projectJson.stages[stage].length; i++) {
      _this._summary = _this._summary
          + chalk.grey(_this._JAWS._meta.projectJson.stages[stage][i].region + ' ')
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
 * CMD: Render Dash
 */

CMD.prototype._renderDash = Promise.method(function() {

  var _this = this;

  JawsCli.log(_this._summary);

  return JawsCli.select(
      null,
      _this._choices,
      true,
      '  Deploy Selected -->');
});

/**
 * CMD: Prompt: Stage
 */

CMD.prototype._promptStage = Promise.method(function() {

  var _this = this;

  // If stage exists, skip
  if (_this._stage) return;

  var stages = Object.keys(_this._JAWS._meta.projectJson.stages);

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

  return JawsCli.select('Choose a stage: ', choices, false)
      .then(function(results) {
        _this._stage = results[0].value;
      });
});

/**
 * CMD: Prompt: Region
 */

CMD.prototype._promptRegion = Promise.method(function() {

  var _this = this;

  // If region exists, skip
  if (_this._regions.length) return;

  var regions = _this._JAWS._meta.projectJson.stages[_this._stage].map(function(s) {
    return s.region;
  });

  // Check if stage has regions
  if (!regions.length) {
    throw new JawsError('This stage has no regions');
  }

  // If stage only has 1 region, use it and skip prompt
  if (regions.length === 1) {
    _this._regions = regions;
    return;
  }

  // Create Choices
  var choices = [];
  for (var i = 0; i < (_this._regions.length + 1); i++) {

    if (_this._regions[i]) {
      choices.push({
        key: (i + 1) + ') ',
        value: _this._regions[i],
        label: _this._regions[i],
      });
    } else {
      // Push 'all regions' choice
      choices.push({
        key: (i + 1) + ') ',
        value: 'all regions',
        label: 'all regions',
      });
    }
  }

  return JawsCli.select('Choose a region within this stage: ', choices, false)
      .then(function(results) {
        if (results[0].value === 'all regions') {
          _this._regions = Object.keys(_this._JAWS._meta.projectJson.stages[_this._stage]);
        } else {
          _this._regions = [results[0].value];
        }
      });
});
