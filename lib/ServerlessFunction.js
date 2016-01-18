'use strict';

/**
 * Serverless Function Class
 * - options.path format is: "moduleFolder/functionFolder#functionName"
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  async        = require('async'),
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

    let _this        = this;
    _this._S         = Serverless;
    _this._config    = {};
    _this.updateConfig(config);

    // Default properties
    _this.name       = _this._config.function || 'function' + SUtils.generateShortId(6);
    _this.handler    = path.posix.join(_this._config.module, _this._config.function, 'handler.handler');
    _this.runtime    = _this._config.runtime || 'nodejs';
    _this.timeout    = 6;
    _this.memorySize = 1024;
    _this.custom     = {
      excludePatterns: [],
      envVars:         []
    };
    _this.endpoints  = [];
    _this.endpoints.push(new _this._S.classes.Endpoint(_this._S, {
      component:      _this._config.component,
      module:         _this._config.module,
      function:       _this._config.function,
      endpointPath:   _this._config.module + '/' + _this._config.function,
      endpointMethod: 'GET'
    }));
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {
    let _this = this;

    // Instantiate Components
    for (let i = 0; i < data.endpoints.length; i++) {

      if (data.endpoints[i] instanceof _this._S.classes.Endpoint) {
        throw new SError('You cannot pass subclasses into the set method, only object literals');
      }

      let instance = new _this._S.classes.Endpoint(_this._S, {
        component:      _this._config.component,
        module:         _this._config.module,
        function:       _this.name,
        endpointPath:   _this._config.module + '/' + _this.name,
        endpointMethod: data.endpoints[i].method
      });
      data.endpoints[i] = instance.set(data.endpoints[i]);
    }

    // Merge
    _.assign(_this, data);
    return _this;
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component || config.module || config.function) {
      this._config.component = config.component;
      this._config.module    = config.module;
      this._config.function  = config.function;
      this._config.sPath     = SUtils.buildSPath({
        component: config.component,
        module:    config.module,
        function:  config.function
      });
    }

    // Make full path
    if (this._S.config.projectPath && this._config.sPath) {
      let parse             = SUtils.parseSPath(this._config.sPath);
      this._config.fullPath = path.join(this._S.config.projectPath, parse.component, parse.module, parse.function);
    }
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   * - Returns Promise
   */

  load() {

    let _this = this,
      functionJson;

    return BbPromise.try(function() {

        // Validate: Check project path is set
        if (!_this._S.config.projectPath) throw new SError('Function could not be loaded because no project path has been set on Serverless instance');

        // Validate: Check function exists
        if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
          throw new SError('Function could not be loaded because it does not exist in your project: ' + _this._config.sPath);
        }

        functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));

        return functionJson.endpoints;
      })
      .each(function(e, i) {

        // Add Endpoint Class Instances
        functionJson.endpoints[i] = new _this._S.classes.Endpoint(_this._S, {
          component:      _this._config.component,
          module:         _this._config.module,
          function:       functionJson.name,
          endpointPath:   e.path,
          endpointMethod: e.method
        });

        return functionJson.endpoints[i].load()
          .then(function(instance) {
            functionJson.endpoints[i] = instance;
            return functionJson.endpoints[i];
          });
      })
      .then(function() {

        // Merge
        _.assign(_this, functionJson);
        return _this;
      });
  }

  /**
   * Get
   * - Return data
   */

  get() {

    let _this = this;

    let clone  = _.cloneDeep(_this);
    for (let i = 0; i < _this.endpoints.length; i++) {
      clone.endpoints[i] = _this.endpoints[i].get();
    }
    return SUtils.exportClassData(clone);
  }

  /**
   * getPopulated
   * - Fill in templates then variables
   * - Returns Promise
   */

  getPopulated(options) {

    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!this._S.config.projectPath) throw new SError('Function could not be populated because no project path has been set on Serverless instance');

    // Populate endpoints
    let clone = this.get();
    if (clone.endpoints) clone.endpoints = [];
    clone = SUtils.populate(this._S, clone, options.stage, options.region);
    clone.endpoints = [];
    for (let i = 0; i < _this.endpoints.length; i++) {
      clone.endpoints[i] = _this.endpoints[i].getPopulated(options);
    }

    return clone;
  }

  /**
   * Save
   * - Saves data to file system
   * - Returns promise
   */

  save(options) {

    let _this = this;

    return new BbPromise.try(function() {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Function could not be saved because no project path has been set on Serverless instance');

      // Create if does not exist
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
        return _this._create();
      }
    })
      .then(function() {

        // Save all nested endpoints
        if (options && options.deep) {
          return BbPromise.try(function () {
              return _this.endpoints;
            })
            .each(function(endpoint) {
              return endpoint.save();
            })
        }
      })
      .then(function() {

        let clone = _this.get();

        // Write file
        return SUtils.writeFile(path.join(_this._config.fullPath, 's-function.json'),
          JSON.stringify(clone, null, 2));
      })
      .then(function() {
        return _this;
      })
  }

  /**
   * Create (scaffolding)
   * - Returns promise
   */

  _create() {

    let _this = this;

    return BbPromise.try(function() {

      let writeDeferred = [];

      // Runtime: nodejs
      if (_this.runtime === 'nodejs') {
        writeDeferred.push(
          fs.mkdirSync(_this._config.fullPath),
          SUtils.writeFile(path.join(_this._config.fullPath, 'handler.js'), fs.readFileSync(path.join(_this._S.config.serverlessPath, 'templates', 'nodejs', 'handler.js'))),
          SUtils.writeFile(path.join(_this._config.fullPath, 'event.json'), '{}')
        )
      }

      return BbPromise.all(writeDeferred);
    });
  }
}

module.exports = ServerlessFunction;