'use strict';

//TODO: make this extend GlobalCmd but it will require some decent sized refactoring in bin/jaws
//plus need to handle if CWD is in a jaws project, to intelligently create it in aws_modules

/**
 * Create jaws module
 *
 */
let ProjectCmd = require('./ProjectCmd.js'),
    JawsError = require('../jaws-error'),
    JawsCLI = require('../utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    path = require('path'),
    utils = require('../utils');

let supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs: ['npm']
  }
};

Promise.promisifyAll(fs);

var CMD = class ModuleCreate extends ProjectCmd {
  constructor(JAWS, name, action, runtime, pkgMgr, modType) {
    super(JAWS);

    if (!runtime) {
      runtime = 'nodejs';
    }

    pkgMgr = pkgMgr || false;

    if (!supportedRuntimes[runtime]) {
      throw new JawsError(`Unsupported runtime "${runtime}"`, JawsError.errorCodes.UNKNOWN);
    }

    let _this = this,
        supportedRuntimeObj = supportedRuntimes[runtime];

    this._module = {
      name: name,
      runtime: runtime,
      action: action,
      pkgMgr: pkgMgr,
      modType: modType,
    };
    this._prompts = {
      properties: {},
    };
    this.Prompter = JawsCLI.prompt();
    this.Prompter.override = {};

    if (pkgMgr && supportedRuntimeObj.validPkgMgrs.indexOf(_this._module.pkgMgr) == -1) {
      throw new JawsError('Unsupported package manger "' + _this._module.pkgMgr + '"', JawsError.errorCodes.UNKNOWN);
    }
  }

  run() {
    let _this = this;

    return this._JAWS.validateProject() //TOOD: make this CWD if not in a JAWS project
        .bind(_this)
        .then(_this._sanitizeData)
        .then(_this._createSkeleton)
        .then(_this._createPackageMgrSkeleton)
        .then(function() {
          JawsCLI.log('Successfully created '
              + _this._module.name
              + '/'
              + _this._module.action);
        });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _createPackageMgrSkeleton() {
    let _this = this,
        deferredWrites = [];

    switch (_this._module.runtime) {
      case 'nodejs':
        if (_this._module.pkgMgr == 'npm') {

          let modulePath = path.join(
              _this._JAWS._meta.projectRootPath,  //TOOD: make this CWD if not in a JAWS project
              'node_modules',
              _this._module.name);
          let templatesPath = path.join(__dirname, '..', 'templates');

          // Create node_module if DNE in node_modules
          if (!utils.dirExistsSync(modulePath)) {
            deferredWrites.push(fs.mkdirAsync(modulePath));
          }

          // Create module package.json if DNE in node_module
          if (!utils.fileExistsSync(path.join(modulePath, 'package.json'))) {
            let packageJsonTemplate = utils.readAndParseJsonSync(path.join(templatesPath, 'nodejs', 'package.json'));
            packageJsonTemplate.name = _this._name;
            packageJsonTemplate.description = 'An aws-module';
            packageJsonTemplate.dependencies = {};
            if (packageJsonTemplate.private) delete packageJsonTemplate.private;
            deferredWrites.push(
                fs.writeFileAsync(
                    path.join(modulePath, 'package.json'),
                    JSON.stringify(packageJsonTemplate, null, 2)
                )
            );
          }

          // Create module awsm.json if DNE in node_module
          if (!utils.fileExistsSync(path.join(modulePath, 'awsm.json'))) {
            let moduleTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'module.awsm.json'));
            moduleTemplateJson.name = _this._module.name;
            deferredWrites.push(
                utils.writeFile(
                    path.join(modulePath, 'awsm.json'),
                    JSON.stringify(moduleTemplateJson, null, 2)));
          }

          // Create root lib folder if DNE in node_module
          let modLibPath = path.join(modulePath, 'lib');
          if (!utils.dirExistsSync(modLibPath)) {
            deferredWrites.push(fs.mkdirAsync(modLibPath));
          }

          // Create awsm folder if DNE in node_module
          if (!utils.dirExistsSync(path.join(modulePath, 'awsm'))) {
            deferredWrites.push(fs.mkdirAsync(path.join(modulePath, 'awsm')));
          }

          // Create action if DNE in node_module
          let actionPath = path.join(modulePath, 'awsm', _this._module.action);
          if (!utils.dirExistsSync(actionPath)) {

            // Fetch skeleton resources
            let actionTemplateJson = utils.readAndParseJsonSync(
                path.join(templatesPath,
                    'action.awsm.json'));

            // Create action awsm.json
            actionTemplateJson.apiGateway.cloudFormation.Path = _this._module.name + '/' + _this._module.action;
            actionTemplateJson.apiGateway.cloudFormation.Method = 'GET';
            actionTemplateJson.apiGateway.cloudFormation.Type = 'AWS';
            actionTemplateJson.lambda.cloudFormation.Runtime = 'nodejs';
            actionTemplateJson.lambda.cloudFormation.Handler = path.join(
                'aws_modules',
                _this._module.name,
                _this._module.action,
                'handler.handler');

            // Create handler.js, index.js, event.json, package.json
            let handlerJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'handler.js'));
            let indexJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'index.js'));

            deferredWrites.push(
                utils.writeFile(
                    path.join(actionPath, 'awsm.json'),
                    JSON.stringify(actionTemplateJson, null, 2)
                ),
                utils.writeFile(path.join(actionPath, 'handler.js'), handlerJs),
                utils.writeFile(path.join(actionPath, 'index.js'), indexJs),
                utils.writeFile(path.join(actionPath, 'event.json'), '{}')
            );
          }
        }
        break;
      default:
        break;
    }

    return Promise.all(deferredWrites);
  }

  /**
   *
   * @private
   */
  _sanitizeData() {
    this._module.name = this._module.name.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

    this._module.action = this._module.action.toLowerCase().trim()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z-\d:]/g, '')
        .substring(0, 19);

  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _createSkeleton() {
    let _this = this,
        writeFilesDeferred = [];

    // Fetch skeleton resources
    let templatesPath = path.join(__dirname, '..', 'templates');
    let actionTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'action.awsm.json'));
    let modulePath = path.join(
        _this._JAWS._meta.projectRootPath,  //TOOD: make this CWD if not in a JAWS project
        'aws_modules',
        _this._module.name);
    let actionPath = path.join(modulePath, _this._module.action);

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
      let moduleTemplateJson = utils.readAndParseJsonSync(path.join(templatesPath, 'module.awsm.json'));
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

    if (['lambda', 'both'].indexOf(_this._module.modType) != -1) {
      // Create files for lambda actions
      switch (_this._module.runtime) {
        case 'nodejs':

          // Edit awsm.json
          actionTemplateJson.lambda.cloudFormation.Runtime = 'nodejs';
          actionTemplateJson.lambda.cloudFormation.Handler = path.join(
              'aws_modules',
              _this._module.name,
              _this._module.action,
              'handler.handler');

          // Create handler.js, index.js, event.json, package.json
          let handlerJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'handler.js'));
          let indexJs = fs.readFileSync(path.join(templatesPath, 'nodejs', 'index.js'));

          writeFilesDeferred.push(
              utils.writeFile(path.join(actionPath, 'handler.js'), handlerJs),
              utils.writeFile(path.join(actionPath, 'index.js'), indexJs),
              utils.writeFile(path.join(actionPath, 'event.json'), '{}')
          );
          break;
        default:
          throw new JawsError('This runtime is not supported "' + _this._module.runtime + '"', JawsError.errorCodes.UNKNOWN);
          break;
      }
    }

    // Trim unnecessary JSON
    if (_this._module.modType === 'lambda') {
      delete actionTemplateJson.apiGateway;
    }

    if (_this._module.modType === 'endpoint') {
      delete actionTemplateJson.lambda;
    }

    // Write Files
    writeFilesDeferred.push(utils.writeFile(path.join(actionPath, 'awsm.json'), JSON.stringify(actionTemplateJson, null, 2)));
    return Promise.all(writeFilesDeferred);
  }

};


/**************************************
 * EXPORTS
 **************************************/

/**
 *
 * @param JAWS
 * @param name
 * @param action
 * @param runtime 'nodejs' default
 * @param pkgMgr is set if publishing as awsm
 * @param moduleType 'lambda','endpoint','both'
 * @returns {*}
 */
exports.run = function(JAWS, name, action, runtime, pkgMgr, moduleType) {
  let command = new CMD(JAWS, name, action, runtime, pkgMgr, moduleType);
  return command.run();
};

exports.ModuleCreateCmd = CMD;