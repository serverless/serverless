'use strict';

/**
 * Serverless Component Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  extend           = require('util')._extend,
  path             = require('path'),
  _                = require('lodash'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessComponent {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component) throw new SError('Missing required config.component');

    this.S = Serverless;
    this.config = {};
    this.updateConfig(config);
    this.load();
  }

  /**
   * Update Config
   * - Takes config.sPath or config.component
   */

  updateConfig(config) {
    if (config) {
      // Set sPath
      if (config.component) this.config.sPath = this.S.buildPath({
        component: config.component
      });
      // Make full path
      if (this.S.config.projectPath && this.config.sPath) {
        let parse = this.S.parsePath(this.config.sPath);
        this._fullPath = path.join(this.S.config.projectPath, parse.component);
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
    _this.data                = {};
    _this.data.name           = _this.config.component || 'component' + SUtils.generateShortId(6);
    _this.data.runtime        = 'nodejs';

    // If paths, check if this is on the file system
    if (!_this.S.config.projectPath ||
      !_this._fullPath ||
      !SUtils.fileExistsSync(path.join(_this._fullPath, 's-component.json'))) return;

    // Get Component JSON
    let component = SUtils.readAndParseJsonSync(path.join(_this._fullPath, 's-component.json'));

    // Add Modules & Functions
    component.modules     = {};
    let componentContents = fs.readdirSync(path.join(_this._fullPath, 'modules'));

    // Check folders to see which is a module
    for (let i = 0; i < componentContents.length; i++) {
      if (SUtils.fileExistsSync(path.join(_this._fullPath, componentContents[i], 's-module.json'))) {
        let module = new this.S.classes.Module(_this.S, { module: componentContents[i] });
        module     = module.get();
        component.modules[module.name] = module;
      }
    }

    // Add to data
    _this = extend(_this.data, component);
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return JSON.parse(JSON.stringify(this.data));
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

  save(options) {

    let _this = this;

    // Validate paths
    if (!_this.S.config.projectPath ||
      !_this._fullPath) throw new SError('Missing project path or required configuration settings.');

    // Save JSON file
    fs.writeFileSync(path.join(
      _this._fullPath,
      's-component.json'),
      JSON.stringify(this.data, null, 2));

    // Save all nested data
    if (options && options.deep) {

      // Loop over functions and save
      Object.keys(_this.data.modules).forEach(function (moduleName) {

        let module = new _this.S.classes.Module(_this.S, {
          sPath: _this.config.component + '/' + moduleName
        });
        module.data = Object.create(_this.data.modules[moduleName]);
        module.save();
      });
    }
  }
}

module.exports = ServerlessComponent;