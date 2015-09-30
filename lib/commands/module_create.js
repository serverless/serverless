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
    utils = require('../utils');

var supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs: ['npm']
  }
};

Promise.promisifyAll(fs);

/**
 *
 * @param JAWS
 * @param name
 * @param action
 * @param runtime 'nodejs' default
 * @param pkgMgrOverride override the default pkg manager for runtime with this one
 * @param moduleType 'lambda','endpoint','both'
 * @returns {*}
 */
module.exports.run = function(JAWS, name, action, runtime, pkgMgrOverride, moduleType) {
  var command = new CMD(JAWS, name, action, runtime, pkgMgrOverride, moduleType);
  return command.run();
};

/**
 *
 * @param JAWS
 * @param name
 * @param action
 * @param runtime
 * @param pkgMgrOverride
 * @param modType
 * @constructor
 */
function CMD(JAWS, name, action, runtime, pkgMgrOverride, modType) {
  if (!runtime) {
    runtime = 'nodejs';
  }

  if (!supportedRuntimes[runtime]) {
    throw new JawsError('Unsupported runtime "' + runtime + '"', JawsError.errorCodes.UNKNOWN);
  }

  var _this = this,
      supportedRuntimeObj = supportedRuntimes[runtime];

  this._JAWS = JAWS;
  this._moduleName = {
    name: name,
    runtime: runtime,
    action: action,
    pkgMgr: pkgMgrOverride || supportedRuntimeObj.defaultPkgMgr,
    type: modType,
  };
  this._prompts = {
    properties: {},
  };
  this.Prompter = JawsCLI.prompt();
  this.Prompter.override = {};

  if (supportedRuntimeObj.validPkgMgrs.indexOf(_this._moduleName.pkgMgr) == -1) {
    throw new JawsError('Unsupported package manger "' + _this._moduleName.pkgMgr + '"', JawsError.errorCodes.UNKNOWN);
  }
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
      .then(_this._createSkeleton)
      .then(_this._createPackageMgrSkeleton)
      .then(function() {
        JawsCLI.log('Successfully created '
            + _this._moduleName.name
            + '/'
            + _this._moduleName.action);
      });
});

/**
 * Install package manager skeleton
 *
 * @returns {Promise}
 */
CMD.prototype._createPackageMgrSkeleton = function() {
  var _this = this,
      deferredWrites = [],
      modulePath = path.join(
          _this._JAWS._meta.projectRootPath,
          'aws_modules',
          _this._moduleName.name);

  switch (_this._moduleName.runtime) {
    case 'nodejs':
      if (_this._moduleName.pkgMgr == 'npm') {
        var packageJsonTemplate = utils.readAndParseJsonSync(path.join(__dirname, '..', 'templates', 'nodejs', 'package.json'));
        packageJsonTemplate.name = _this._name;
        packageJsonTemplate.dependencies = {};
        deferredWrites.push(
            fs.writeFileAsync(
                path.join(modulePath, 'package.json'),
                JSON.stringify(packageJsonTemplate, null, 2)
            )
        );
      }
      break;
    default:
      break;
  }

  return Promise.all(deferredWrites);
};

/**
 * CMD: Sanitize Data
 */

CMD.prototype._sanitizeData = Promise.method(function() {

  var _this = this;

  _this._moduleName.name = _this._moduleName.name.toLowerCase().trim()
      .replace(/\s/g, '-')
      .replace(/[^a-zA-Z-\d:]/g, '')
      .substring(0, 19);

  _this._moduleName.action = _this._moduleName.action.toLowerCase().trim()
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
      'aws_modules',
      _this._moduleName.name);
  var actionPath = path.join(modulePath, _this._moduleName.action);

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
    moduleTemplateJson.name = _this._moduleName.name;
    writeFilesDeferred.push(
        utils.writeFile(
            path.join(modulePath, 'awsm.json'),
            JSON.stringify(moduleTemplateJson, null, 2)));
  }

  // Create action folder
  writeFilesDeferred.push(actionPath);

  // Create action awsm.json
  actionTemplateJson.apiGateway.cloudFormation.Path = _this._moduleName.name + '/' + _this._moduleName.action;
  actionTemplateJson.apiGateway.cloudFormation.Method = 'GET';
  actionTemplateJson.apiGateway.cloudFormation.Type = 'AWS';

  if (['lambda', 'both'].indexOf(_this._moduleName.type) != -1) {
    // Create files for lambda actions
    switch (_this._moduleName.runtime) {
      case 'nodejs':
        var modLibPath = path.join(modulePath, 'lib');
        if (!utils.dirExistsSync(modLibPath)) {
          writeFilesDeferred.push(fs.mkdirAsync(modLibPath));
        }

        // Edit jaws.json
        actionTemplateJson.lambda.cloudFormation.Runtime = 'nodejs';
        actionTemplateJson.lambda.cloudFormation.Handler = path.join(
            'aws_modules',
            _this._moduleName.name,
            _this._moduleName.action,
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
        throw new JawsError('This runtime is not supported "' + _this._moduleName.runtime + '"', JawsError.errorCodes.UNKNOWN);
        break;
    }
  }

  // Trim unnecessary JSON
  if (_this._moduleName.type === 'lambda') {
    delete actionTemplateJson.apiGateway;
  }

  if (_this._moduleName.type === 'endpoint') {
    delete actionTemplateJson.lambda;
  }

  // Write Files
  writeFilesDeferred.push(utils.writeFile(path.join(actionPath, 'awsm.json'), JSON.stringify(actionTemplateJson, null, 2)));
  return Promise.all(writeFilesDeferred);
});
