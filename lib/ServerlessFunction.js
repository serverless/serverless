'use strict';

/**
 * Serverless Function Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError     = require('./ServerlessError'),
    SUtils       = require('./utils/index'),
    SCli         = require('./utils/cli'),
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
    this.S = Serverless;
    this.load(options);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(options) {

    let _this = this;

    // Defaults
    _this._projectPath   = options.projectPath;
    _this._functionPath  = options.functionPath;
    _this._populated     = false;
    _this.data           = {};
    _this.data.endpoints = [];
    _this.functionPath   = functionPath;

    // If no function path exists, return
    if (!_this.loadJson) return;

    let func = SUtils.readAndParseJsonSync(path.join(_this._projectPath,
      'back',
      'modules',
      _this._functionPath,
      's-function.json'));

    _this = extend(_this.data, func);
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return this.data;
  }


  /**
   * Populate
   * - Fill in templates then variables
   */

  populate(stage, region) {

    this._populated = true;

    // just to be sure, this.data is the function JSON right?!
    this.data = SUtils.populate(this.data, this.S._projectRootPath, stage, region);
  }

  /**
   * save
   * - saves data to file system
   */

  save() {

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this._projectPath,
      'back',
      'modules',
      this._functionPath,
      's-function.json'));

    // check if data changed
    if (_.isEqual(functionJson, this.data)) return;

    // overwrite function JSON file
    fs.writeFileSync(path.join(_this._projectPath, 'back', 'modules', _this._functionPath, 's-function.json'),
      JSON.stringify(this.data, null, 2));

    return;
  }
}

module.exports = ServerlessFunction;

