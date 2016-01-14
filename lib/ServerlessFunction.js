'use strict';

/**
 * Serverless Function Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class ServerlessFunction {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module || !config.function) throw new SError('Missing required config.component, config.module or config.function');

    let _this    = this;
    _this.S      = Serverless;
    _this.config = {};
    _this.updateConfig(config);

    // Default properties
    _this.data            = {};
    _this.data.name       = _this.config.function || 'function' + SUtils.generateShortId(6);
    _this.data.handler    = path.posix.join(_this.config.module, _this.config.function, 'handler.handler');
    _this.data.runtime    = _this.config.runtime || 'nodejs';
    _this.data.timeout    = 6;
    _this.data.memorySize = 1024;
    _this.data.custom     = {
      excludePatterns:      [],
      envVars:              []
    };
    _this.data.endpoints  = [];
    _this.data.endpoints.push(new _this.S.classes.ServerlessEndpoint(_this.S, {
      component:  _this.config.component,
      module:     _this.config.module,
      function:   _this.config.function,
      endpoint:   '@' + _this.config.module + '/' + _this.config.function + '~' + 'GET'
    }));
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {

    if (!config) return;

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
      let parse            = this.S.parsePath(this.config.sPath);
      this.config.fullPath = path.join(this.S.config.projectPath, parse.component, parse.module, parse.function);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {

    let _this = this;

    // Validate: Check project path is set
    if (!this.S.config.projectPath) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

    // Validate: Check function exists
    if (!SUtils.fileExistsSync(path.join(_this.config.fullPath, 's-function.json'))) {
      throw new SError('Function could not be loaded because it does not exist in your project: ' + _this.config.sPath);
    }

    let functionJson = SUtils.readAndParseJsonSync(path.join(_this.config.fullPath, 's-function.json'));

    // Add Endpoint Class Instances
    for (let i = 0; i < functionJson.endpoints.length; i++) {
        let endpoint = new ServerlessEndpoint(_this.S, {
          component: _this.config.component,
          module:    _this.config.module,
          function:  functionJson.name,
          endpoint:  '@' + _this.config.module + '/' + functionJson.name + '~' + 'GET'
        });
      functionJson.endpoints[i] = endpoint.load();
    }

    _this.data = functionJson;
  }

  /**
   * Get
   * - Return data
   */

  get() {
    let clone = _.cloneDeep(this.data);
    for (let i = 0; i < this.data.endpoints.length; i++) {
      clone.endpoints[i] = clone.endpoints[i].get();
    }
    return clone;
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   */

  getPopulated(options) {

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this.S.config.projectPath) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate module and its functions
    let clone = _.cloneDeep(this.data);
    if (clone.endpoints) clone.endpoints = [];
    clone = SUtils.populate(this.S, clone, options.stage, options.region);
    for (let i = 0; i < this.data.endpoints.length; i++) {
      clone.endpoints[i] = this.data.endpoints[i].getPopulated(options);
    }

    return clone;
  }

  /**
   * save
   * - Saves data to file system
   */

  save(options) {

    let _this = this;

    // Validate: Check project path is set
    if (!_this.S.config.projectPath) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

    // Save all nested data
    if (options && options.deep) {

      // Loop over endpoints and save
      for (let i = 0; i < this.data.endpoints.length; i++) {
        this.data.endpoints[i] = this.data.endpoints[i].save();
      }
    }

    // Strip endpoints property
    let clone = _this.get();
    if (clone.endpoints) delete clone.endpoints;

    // Save JSON file
    fs.writeFileSync(path.join(
      _this.config.fullPath,
      's-function.json'),
      JSON.stringify(clone, null, 2));
  }
}

module.exports = ServerlessFunction;