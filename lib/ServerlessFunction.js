'use strict';

/**
 * Serverless Function Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError     = require('./ServerlessError'),
    SUtils       = require('./utils/index'),
    extend       = require('util')._extend,
    path         = require('path'),
    fs           = require('fs'),
    _            = require('lodash'),
    BbPromise    = require('bluebird');

class ServerlessFunction {

  /**
   * Constructor
   */

  constructor(Serverless, options) {
    this.S       = Serverless;
    this.options = options || {};
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Defaults
    _this.moduleName     = null;
    _this.data           = {};
    _this.data.name      = _this.options.function || 'function' + SUtils.generateShortId(6);
    _this.data.custom    = {
      "excludePatterns": [],
      "envVars": []
    };
    _this.data.handler   = (_this.options.function && _this.options.module) ? path.join('modules', _this.options.module, 'functions', _this.options.function, 'handler.handler') : "";
    _this.data.timeout   = 6;
    _this.data.memorySize = 1024;
    _this.data.events = [];
    _this.data.endpoints = [
      {
        "path": (_this.options.function && _this.options.module) ? _this.options.module + "/" + _this.options.function : "",
        "method": "GET",
        "authorizationType": "none",
        "apiKeyRequired": false,
        "requestParameters": {},
        "requestTemplates": {
          "application/json": ""
        },
        "responses": {
          "default": {
            "statusCode": "200",
            "responseParameters": {},
            "responseModels": {},
            "responseTemplates": {
              "application/json": ""
            }
          },
          "400": {
            "statusCode": "400"
          }
        }
      }
    ];

    if (_this.options.module && _this.options.function) {
      _this.options.functionPath = path.join(
        _this.S.config.projectPath,
        'back',
        'modules',
        _this.options.module,
        'functions',
        _this.options.function,
        's-function.json');
    }

    // If no function path exists, return
    if (!_this.options.functionPath || !SUtils.fileExistsSync(path.join(_this.options.functionPath, 's-function.json'))) return;

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this.options.functionPath, 's-function.json'));

    _this.data = extend(_this.data, functionJson);

    // Add Module Instance
    _this.module = new _this.S.classes.Module(_this.S, { module: _this.options.module });
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return this.data;
  }


  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(stage, region) {

    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), stage, region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // If file exists, do a diff and skip if equal
    if (SUtils.fileExistsSync(path.join(_this.options.functionPath, 's-function.json'))) {

      let functionJson = SUtils.readAndParseJsonSync(path.join(_this.options.functionPath, 's-function.json'));

      // check if data changed
      if (_.isEqual(functionJson, this.data)) return;
    }

    // overwrite function JSON file
    fs.writeFileSync(path.join(_this.options.functionPath, 's-function.json'),
      JSON.stringify(this.data, null, 2));

    return;
  }
}

module.exports = ServerlessFunction;