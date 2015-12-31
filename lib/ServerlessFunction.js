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

  load(functionPath) {

    let _this = this;

    // TODO: If functionPath, validate it...
    if (functionPath) _this.options.functionPath = functionPath;

    // Defaults
    _this.data           = {};
    _this.data.endpoints = [];

    // If no function path exists, return
    if (!_this.options.functionPath) return;

    let func = SUtils.readAndParseJsonSync(path.join(_this.options.functionPath, 's-function.json'));

    _this.data = extend(_this.data, func);
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
    let data = this.get();
    data     = SUtils.populate(data, this.S._projectRootPath, stage, region);
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