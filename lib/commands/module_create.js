'use strict';

/**
 * JAWS Command: New Module (Lambda/Endpoint)
 */

// Defaults
var JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils'),
    modInstall = require('./module_install');

Promise.promisifyAll(fs);

/**
 * Run
 */

module.exports.run = function(JAWS, module) {
  var command = new CMD(JAWS, module);
  return command.run();
};

/**
 * CMD Classlam
 */

function CMD(JAWS, module) {
  this._JAWS = JAWS;
  this._module = module;
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCLI.prompt();
  this.Prompter.override = {};

  // Defaults
  this._module.runtime = this._module.runtime || 'nodejs';
}

CMD.prototype.constructor = CMD;

/**
 * CMD: Run
 */

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._sanitizeData)
      .then(_this._installCore)
      .then(_this._createSkeleton)
      .then(function() {
        JawsCLI.log('Successfully created '
            + _this._module.name
            + '/'
            + _this._module.action);
      });
});

/**
 * Install jaws core if it DNE
 *
 * @returns {Promise}
 */
CMD.prototype._installCore = Promise.method(function() {
  var _this = this,
      jawsCoreName = '';

  if (_this._module.runtime == 'nodejs') {
    jawsCoreName = 'jaws-core-js';
  }

  if (!!jawsCoreName) {
    var existingJawsCorePath = path.join(_this._JAWS._meta.projectRootPath, 'back', 'aws_modules', jawsCoreName);

    utils.jawsDebug('module_create', 'Looking for existing jaws core in ' + existingJawsCorePath);

    if (!utils.dirExistsSync(existingJawsCorePath)) {
      utils.jawsDebug('module_create', jawsCoreName + ' DNE, installing');
      return modInstall.install(_this._JAWS, 'https://github.com/jaws-framework/' + jawsCoreName, true, false);
    }
  }
});

/**
 * CMD: Sanitize Data
 */

CMD.prototype._sanitizeData = Promise.method(function() {

  var _this = this;

  _this._module.name = _this._module.name.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  _this._module.action = _this._module.action.toLowerCase().trim()
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
  var actionTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'action.awsm.json'));
  var modulePath = path.join(
      _this._JAWS._meta.projectRootPath,
      'back',
      'aws_modules',
      _this._module.name);
  var actionPath = path.join(modulePath, _this._module.action);

  // If module/action already exists, throw error
  if (utils.dirExistsSync(actionPath)) {
    throw new JawsError(
        actionPath + ' already exists',
        JawsError.errorCodes.INVALID_PROJECT_JAWS
    );
  }

  //module path will get created by util.writeFile if DNE

  // If module awsm.json doesn't exist, create it
  if (!utils.fileExistsSync(path.join(modulePath, 'awsm.json'))) {
    var moduleTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'module.awsm.json'));
    moduleTemplateJson.name = _this._module.name;
    writeFilesDeferred.push(
        utils.writeFile(
            path.join(modulePath, 'awsm.json'),
            JSON.stringify(moduleTemplateJson, null, 2)));
  }

  // Create action folder
  writeFilesDeferred.push(actionPath);

  // Create action awsm.json
  actionTemplateJson.apiGateway.cloudFormation.Path = _this._module.name + '/' + _this._module.action;
  actionTemplateJson.apiGateway.cloudFormation.Method = 'GET';
  actionTemplateJson.apiGateway.cloudFormation.Type = 'AWS';

  if (['lambda', 'both'].indexOf(_this._module.type) != -1) {
    // Create files for lambda actions
    switch (_this._module.runtime) {
      case 'nodejs':
        // If module package.json doesnt exist, create it
        var pkgJsonPath = path.join(modulePath, 'package.json');
        if (!utils.fileExistsSync(pkgJsonPath)) {
          var packageTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'nodejs', 'package.json'));
          packageTemplateJson.name = _this._module.name;
          writeFilesDeferred.push(
              utils.writeFile(pkgJsonPath, JSON.stringify(packageTemplateJson, null, 2))
          );
        }

        var modLibPath = path.join(modulePath, 'lib');
        if (!utils.dirExistsSync(modLibPath)) {
          writeFilesDeferred.push(fs.mkdirAsync(modLibPath));
        }

        // Edit jaws.json
        actionTemplateJson.lambda.cloudFormation.Runtime = 'nodejs';
        actionTemplateJson.lambda.cloudFormation.Handler = path.join(
            'aws_modules',
            _this._module.name,
            _this._module.action,
            'handler.handler');

        // Create handler.js, index.js, event.json, package.json
        var handlerJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'handler.js'));
        var indexJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'index.js'));

        writeFilesDeferred.push(
            utils.writeFile(path.join(actionPath, 'handler.js'), handlerJs),
            utils.writeFile(path.join(actionPath, 'index.js'), indexJs),
            utils.writeFile(path.join(actionPath, 'event.json'), '{}')
        );
        break;
      default:
        throw new JawsError('This runtime is not supported "' + _this._module.runtime + '"');
        break;
    }
  }

  // Trim unnecessary JSON
  if (_this._module.type === 'lambda') {
    delete actionTemplateJson.apiGateway;
  }

  if (_this._module.type === 'endpoint') {
    delete actionTemplateJson.lambda;
  }

  // Write Files
  writeFilesDeferred.push(utils.writeFile(path.join(actionPath, 'awsm.json'), JSON.stringify(actionTemplateJson, null, 2)));
  return Promise.all(writeFilesDeferred);
});
