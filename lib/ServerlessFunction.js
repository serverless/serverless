'use strict';

/**
 * Serverless Function Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError     = require('./ServerlessError'),
    SUtils       = require('./utils/index'),
    SCli         = require('./utils/cli'),
    awsMisc      = require('./utils/aws/Misc'),
    extend       = require('util')._extend,
    path         = require('path'),
    fs           = require('fs'),
    BbPromise    = require('bluebird');

class ServerlessFunction {

  /**
   * Constructor
   */

  constructor(Serverless, options) {
    this.S = Serverless;
    this.load(options.path);
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load(functionPath) {

    let _this = this;

    //TODO: Validate Path (ensure it has '/' and '#')

    // Defaults
    _this._populated     = false;
    _this.data           = {};
    _this.data.endpoints = [];

    // If no project path exists, return
    if (!functionPath) return;

    let func = SUtils.readAndParseJsonSync(path.join(
        _this.S._projectRootPath,
        'back',
        'modules',
        functionPath.split('/')[0],
        'functions',
        functionPath.split('/')[1].split('#')[0],
        's-function.json'));

    func      = func.functions[functionPath.split('#')[1]];
    func.name = functionPath.split('#')[1]; // Add name, for consistency

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
   * Set
   * - Update data
   */

  set(data) {

    // TODO: Validate data

    this.data = data;
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
}

module.exports = ServerlessFunction;

