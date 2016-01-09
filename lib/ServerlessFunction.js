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

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module || !config.function) throw new SError('Missing required config.component, config.module or config.function');

    this.S = Serverless;
    this.config = {};
    this.updateConfig(config);
    this.load();
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {
    if (config) {
      // Set sPath
      if (config.component || config.module || config.function) {
        this.config.component = config.component;
        this.config.module    = config.module;
        this.config.function  = config.function;
        this.config.sPath     = this.S.buildPath({
          component: config.component,
          module:    config.module,
          function:  config.function
        });
      }
      // Make full path
      if (this.S.config.projectPath && this.config.sPath) {
        let parse = this.S.parsePath(this.config.sPath);
        this._fullPath = path.join(this.S.config.projectPath, parse.component, parse.module, parse.function);
      }
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Defaults
    _this.data           = {};
    _this.data.name      = _this.config.function || 'function' + SUtils.generateShortId(6);
    _this.data.handler   = path.posix.join(_this.config.module, _this.config.function, 'handler.handler');
    _this.data.runtime   = _this.config.runtime || 'nodejs';
    _this.data.timeout   = 6;
    _this.data.memorySize = 1024;
    _this.data.custom    = {
      "excludePatterns": [],
      "envVars": []
    };
    _this.data.events = [];
    _this.data.endpoints = [
      {
        "path": _this.config.module + '/' + _this.config.function,
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
    // If paths, check if this is on the file system
    if (!_this.S.config.projectPath ||
      !_this._fullPath ||
      !SUtils.fileExistsSync(path.join(_this._fullPath, 's-function.json'))) return;

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this._fullPath, 's-function.json'));

    _this.data = extend(_this.data, functionJson);
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

  getPopulated(options) {

    options = options || {};

    // Required: Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S.config.projectPath) throw new SError('Project path must be set on Serverless instance');

    // Return
    return SUtils.populate(this.S, this.get(), options.stage, options.region);
  }

  /**
   * save
   * - Saves data to file system
   */

  save() {

    let _this = this;

    // Validate paths
    if (!_this.S.config.projectPath ||
      !_this._fullPath) throw new SError('Missing project path or required configuration settings.');

    // Save JSON file
    fs.writeFileSync(path.join(
      _this._fullPath,
      's-function.json'),
      JSON.stringify(this.data, null, 2));
  }
}

module.exports = ServerlessFunction;