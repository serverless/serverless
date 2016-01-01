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
    this.load(options);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(module, func) {

    let _this = this;

    if (module) {
      _this.options.module       = module;
      _this.options.function     = func;
      _this.options.functionPath = path.join(
        _this.S._projectRootPath,
        'back',
        'modules',
        _this.options.module,
        'functions',
        _this.options.function,
        's-function.json');
    }

    // TODO: Validate function exists

    // Defaults
    _this.data           = {};
    _this.data.endpoints = [];

    // If no function path exists, return
    if (!_this.options.functionPath) return;

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this.options.functionPath, 's-function.json'));

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

  getPopulated(stage, region) {

    // Required: Stage & Region
    if (!stage || !region) throw new SError('Both "stage" and "region" params are required');

    // Required: Project Path
    if (!this.S._projectRootPath) throw new SError('Project path must be set on Serverless instance');

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