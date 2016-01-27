'use strict';

/**
 * Serverless Event Class
 * - options.path format is: "component/module/function#eventName"
 */

const SError   = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  fs           = require('fs'),
  _            = require('lodash');

class ServerlessEvent {

  /**
   * Constructor
   */

  constructor(Serverless, config) {

    // Validate required attributes
    if (!config.component || !config.module || !config.function || !config.name || !config.type || !config.config) throw new SError('Missing required config.component, config.module, config.function, config.name, config.type, config.config');

    // Private properties
    let _this     = this;
    _this._S      = Serverless;
    _this._config = {};
    _this.updateConfig(config);

    // Default properties
    _this.name   = config.name;
    _this.type   = config.type;
    _this.config = config.config;
  }

  /**
   * Update Config
   * - Takes config.component, config.module, config.function
   */

  updateConfig(config) {

    if (!config) return;

    // Set sPath
    if (config.component || config.module || config.function) {
      this._config.component      = config.component;
      this._config.module         = config.module;
      this._config.function       = config.function;
      this._config.sPath          = SUtils.buildSPath({
        component:      config.component,
        module:         config.module,
        function:       config.function,
        event:      config.name
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

    let _this = this;

    return new BbPromise(function(resolve) {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Event could not be loaded because no project path has been set on Serverless instance');

      // Validate: Check function exists
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
        throw new SError('Event could not be loaded because it does not exist in your project: ' + _this._config.sPath);
      }

      let functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
      let event     = null;
      for (let i = 0; i < functionJson.events.length; i++) {
        if (functionJson.events[i].name === _this.name) {
          event = functionJson.events[i];
        }
      }

      if (!event) throw new SError('Event was not found: ' + _this._config.sPath);

      // Merge
      _.assign(_this, event);

      return resolve(_this);
    });
  }

  /**
   * Set
   * - Set data
   * - Accepts a data object
   */

  set(data) {

    // Merge
    _.assign(this, data);
    return this;
  }

  /**
   * Get
   * - Return data
   */

  get() {
    return SUtils.exportClassData(_.cloneDeep(this));
  }

  /**
   * Get Populated
   * - Fill in templates then variables
   * - Returns Promise
   */

  getPopulated(options) {

    let _this = this;

    options = options || {};

    // Validate: Check Stage & Region
    if (!options.stage || !options.region) throw new SError('Both "stage" and "region" params are required');

    // Validate: Check project path is set
    if (!_this._S.config.projectPath) throw new SError('Event could not be populated because no project path has been set on Serverless instance');

    // Populate
    let clone               = _this.get();
    clone  = SUtils.populate(_this._S.state.getMeta(), _this.getTemplates(), clone, options.stage, options.region);
    return clone;
  }

  /**
   * Get Templates
   * - Returns clone of templates
   * - Inherits parent templates
   */

  getTemplates() {
    return _.merge(
      this.getProject().getTemplates(),
      this.getComponent().getTemplates(),
      this.getModule().getTemplates(),
      this.getFunction().getTemplates(),
      _.cloneDeep(this.templates)
    );
  }

  /**
   * Save
   * - Saves data to file system
   * - Returns promise
   */

  save() {

    let _this = this;

    return new BbPromise(function(resolve) {

      // Validate: Check project path is set
      if (!_this._S.config.projectPath) throw new SError('Event could not be saved because no project path has been set on Serverless instance');

      // Validate: Check function exists
      if (!SUtils.fileExistsSync(path.join(_this._config.fullPath, 's-function.json'))) {
        throw new SError('Event could not be saved because its function does not exist');
      }

      // Check if event exists, and replace it if so
      let functionJson = SUtils.readAndParseJsonSync(path.join(_this._config.fullPath, 's-function.json'));
      let event = null;
      for (let i = 0; i < functionJson.events.length; i++) {
        if (functionJson.events[i].name === _this.name) {
          event = functionJson.events[i];
          functionJson.events[i] = _this.get();
        }
      }

      if (!event) functionJson.events.push(_this.get());

      // Save updated function file
      return SUtils.writeFile(path.join(_this._config.fullPath, 's-function.json'), JSON.stringify(functionJson, null, 2))
        .then(resolve);
    });
  }

  /**
   * Get Project
   * - Returns reference to the instance
   */

  getProject() {
    return this._S.state.project;
  }

  /**
   * Get Component
   * - Returns reference to the instance
   */

  getComponent() {

    let components = this._S.state.getComponents({
      component: this._config.component
    });

    if (components.length === 1) {
      return components[0];
    }

    throw new SError('Could not find component for event');
  }

  /**
   * Get Module
   * - Returns reference to the instance
   */

  getModule() {

    let modules = this._S.state.getModules({
      component: this._config.component,
      module:    this._config.module
    });

    if (modules.length === 1) {
      return modules[0];
    }

    throw new SError('Could not find module for event');
  }

  /**
   * Get Function
   * - Returns reference to the instance
   */

  getFunction() {

    let functions = this._S.state.getFunctions({
      component: this._config.component,
      module:    this._config.module,
      function:  this._config.function
    });

    if (functions.length === 1) {
      return functions[0];
    }

    throw new SError('Could not find function for event');
  }
}

module.exports = ServerlessEvent;
