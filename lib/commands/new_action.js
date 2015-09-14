'use strict';

/**
 * JAWS Command: New Action (Lambda/Endpoint)
 */

// Defaults
var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    prompt = require('prompt'),
    utils = require('../utils'),
    wrench = require('wrench');

Promise.promisifyAll(fs);

/**
 * Run
 */

module.exports.run = function(JAWS, action) {
  var command = new CMD(JAWS, action);
  return command.run();
};

/**
 * CMD Class
 */

function CMD(JAWS, action) {
  this._JAWS = JAWS;
  this._action = action;
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCLI.prompt();
  this.Prompter.override = {};

  // Defaults
  action.runtime = action.runtime || 'nodejs';
}

CMD.prototype.constructor = CMD;

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return Promise.try(function() {})
      .bind(_this)
      .then(_this._sanitizeData)
      .then(_this._createSkeleton);
});

/**
 * CMD: Sanitize Data
 */

CMD.prototype._sanitizeData = Promise.method(function() {

  var _this = this;

  _this._action.resource = _this._action.resource.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  _this._action.action = _this._action.action.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

});

/**
 * CMD: Create skeleton
 */

CMD.prototype._createSkeleton = Promise.method(function() {

  var _this = this;
  var writeFilesDeferred = [];

  // Fetch skeleton resources
  var templatesPath = path.join(__dirname, '..', 'templates');
  var actionJson = JSON.parse(fs.readFileSync(path.join(templatesPath, 'jaws.json')));
  var actionPath = path.join(
      _this._JAWS._meta.projectRootPath,
      'back',
      'lambdas',
      _this._action.resource,
      _this._action.action);

  // Make resource/action folders, if don't exist
  if (!fs.existsSync(actionPath)) {
    writeFilesDeferred.push(actionPath);
  }

  // Edit jaws.json
  actionJson.name = _this._action.resource + '-' + _this._action.action;
  actionJson.lambda.functionName = actionJson.name;

  // Create files for lambda actions
  switch (_this._action.runtime) {
    case 'nodejs':

      // Edit jaws.json
      actionJson.lambda.runtimeVer = '0.10.36';
      actionJson.lambda.handler = path.join(actionPath, 'index.handler');

      // Create index.js, event.json
      var handlerJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'handler.js'));
      writeFilesDeferred.push(
          utils.writeFile(path.join(actionPath, 'index.js'), handlerJs),
          utils.writeFile(path.join(actionPath, 'event.json'), '{}')
      );

      // Make package.json, if it doesn't exist already
      var packageJsonPath = path.join(_this._JAWS._meta.projectRootPath, 'back', 'package.json');
      var packageJson = JSON.parse(fs.readFileSync(path.join(templatesPath, 'nodejs', 'package.json')));
      if (!fs.existsSync(packageJsonPath)) {
        utils.logIfVerbose('creating package.json since it does not exist');
        writeFilesDeferred.push(
            utils.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
        );
      }

      // Copy over dotenv if it doesn't already exist
      var nodeModulesPath = path.join(_this._JAWS._meta.projectRootPath, 'back', 'node_modules');
      if (!fs.existsSync(path.join(nodeModulesPath, 'dotenv'))) {
        if (!fs.existsSync(nodeModulesPath)) {
          fs.mkdirSync(nodeModulesPath);
        }
        wrench.copyDirSyncRecursive(path.resolve(__dirname, '..', '..', 'node_modules', 'dotenv'),
            path.join(nodeModulesPath, 'dotenv'));
      }

      break;
    default:
      throw new JawsError('This runtime is not supported "' + _this._action.runtime + '"');
      break;
  }

  // Trim unnecessary JSON
  if (_this._action.type === 'lambda') {
    delete actionJson.endpoint;
  }

  if (_this._action.type === 'endpoint') {
    delete actionJson.lambda;
  }

  // Write Files
  writeFilesDeferred.push(utils.writeFile(path.join(actionPath, 'jaws.json'), JSON.stringify(actionJson, null, 2)));
  return Promise.all(writeFilesDeferred);
});